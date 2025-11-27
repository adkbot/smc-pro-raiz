"""Main entry point for Vision Trading Agent."""
import argparse
import sys
from pathlib import Path
from typing import Optional

from .config import config
from .utils import logger
from .agent import (
    VideoProcessor,
    FrameBuffer,
    FeatureExtractor,
    ModelInference
)
from .agent.supabase_client import SupabaseClient


class VisionTradingAgent:
    """Main Vision Trading Agent class."""
    
    def __init__(self):
        # Validate configuration
        config.validate()
        
        # Initialize components
        self.video_processor = VideoProcessor()
        self.feature_extractor = FeatureExtractor()
        self.model = ModelInference()
        self.supabase = SupabaseClient()
        self.frame_buffer = FrameBuffer()
        
        # Statistics
        self.stats = {
            'frames_processed': 0,
            'signals_generated': 0,
            'signals_sent': 0,
            'signals_executed': 0
        }
        
        logger.info(f"Vision Trading Agent initialized in {config.MODE} mode")
    
    def process_video(self, youtube_url: str, video_id: str = None) -> bool:
        """
        Process a single video.
        
        Args:
            youtube_url: YouTube video URL
            video_id: Optional video ID (will be extracted from URL if not provided)
            
        Returns:
            True if successful, False otherwise
        """
        # Extract video ID from URL if not provided
        if video_id is None:
            import re
            match = re.search(r'(?:v=|\/)([0-9A-Za-z_-]{11}).*', youtube_url)
            if match:
                video_id = match.group(1)
            else:
                logger.error("Could not extract video ID from URL")
                return False
        
        logger.info(f"Processing video: {video_id}")
        logger.info(f"URL: {youtube_url}")
        
        # Create or update video record in database
        self.supabase.update_video_status(video_id, 'processing', processed_frames=0)
        
        try:
            # Download video
            video_path = self.video_processor.download_video(youtube_url, video_id)
            
            if video_path is None:
                self.supabase.update_video_status(
                    video_id,
                    'failed',
                    error_message='Failed to download video'
                )
                return False
            
            # Get video info
            video_info = self.video_processor.get_video_info(video_path)
            total_frames = video_info['total_frames']
            
            logger.info(f"Video info: {video_info}")
            
            # Reset buffer and stats for this video
            self.frame_buffer.clear()
            video_signals = 0
            
            # Process frames
            for frame_idx, frame in self.video_processor.extract_frames(video_path):
                # Extract features
                features = self.feature_extractor.extract_features(frame, frame_idx)
                
                # Add to buffer
                self.frame_buffer.add({
                    'frame_idx': frame_idx,
                    'features': features['vector']
                })
                
                self.stats['frames_processed'] += 1
                
                # Update progress periodically
                if frame_idx % (config.FRAME_STEP * 10) == 0:
                    self.supabase.update_video_status(
                        video_id,
                        'processing',
                        processed_frames=frame_idx,
                        signals_generated=video_signals
                    )
                
                # When buffer is ready, make prediction
                if self.frame_buffer.is_ready():
                    sequence = self.frame_buffer.get_sequence()
                    action, confidence = self.model.predict(sequence)
                    
                    # HEURISTIC OVERRIDE: Listen to the teacher!
                    # If specific keywords are detected, override the model
                    direction = 'LONG'
                    words = [w.lower() for w in features['text']['words']]
                    
                    if any(w in ['compra', 'comprar', 'buy', 'enter', 'long'] for w in words):
                        action = 'ENTER'
                        direction = 'LONG'
                        confidence = 0.95
                        logger.info(f"Heuristic override: Detected BUY command")
                    elif any(w in ['venda', 'vender', 'sell', 'short'] for w in words):
                        action = 'ENTER'
                        direction = 'SHORT'
                        confidence = 0.95
                        logger.info(f"Heuristic override: Detected SELL command")
                    elif any(w in ['fechar', 'sair', 'exit', 'close'] for w in words):
                        action = 'EXIT'
                        confidence = 0.95
                        logger.info(f"Heuristic override: Detected EXIT command")
                    
                    # Process action
                    if action != 'IGNORE' and confidence >= config.CONFIDENCE_THRESHOLD:
                        self._handle_signal(
                            action=action,
                            confidence=confidence,
                            video_id=video_id,
                            frame_idx=frame_idx,
                            features=features,
                            direction=direction
                        )
                        video_signals += 1
            
            # Mark video as completed
            self.supabase.update_video_status(
                video_id,
                'completed',
                processed_frames=total_frames,
                signals_generated=video_signals
            )
            
            logger.info(f"Video processing completed: {video_id}")
            logger.info(f"Frames processed: {self.stats['frames_processed']}")
            logger.info(f"Signals generated: {video_signals}")
            
            return True
            
        except Exception as e:
            logger.error(f"Error processing video: {e}", exc_info=True)
            self.supabase.update_video_status(
                video_id,
                'failed',
                error_message=str(e)
            )
            return False
        
        finally:
            # Do not cleanup feature extractor here as it is shared across videos
            pass
    
    def cleanup(self):
        """Release resources."""
        if hasattr(self, 'feature_extractor'):
            self.feature_extractor.cleanup()
    
    def _handle_signal(
        self,
        action: str,
        confidence: float,
        video_id: str,
        frame_idx: int,
        features: dict,
        direction: str = 'LONG'
    ):
        """
        Handle a trading signal.
        
        Applies mode-specific logic and sends to Supabase if appropriate.
        """
        self.stats['signals_generated'] += 1
        
        logger.info(f"Signal: {action} ({direction}) | Confidence: {confidence:.2f} | Frame: {frame_idx}")
        
        # Build features summary for logging
        features_summary = {
            'hands_detected': features['hands']['detected'],
            'hand_count': features['hands']['count'],
            'lines_detected': features['drawings']['lines_detected'],
            'line_count': features['drawings']['line_count'],
            'text_detected': features['text']['text_detected'],
            'text_words': len(features['text']['words']),
            'arrows_detected': features['arrows']['arrows_detected'],
            'motion_detected': features['motion']['motion_detected']
        }
        
        # Calculate entry, SL, TP (simplified - in real scenario, would be extracted from features)
        # Here we use dummy values for demonstration
        entry_price = 50000.0  # Would come from OCR text extraction
        risk_reward = config.DEFAULT_RR
        stop_distance = entry_price * 0.01  # 1% stop
        
        if action == 'ENTER':
            stop_loss = entry_price - stop_distance if direction == 'LONG' else entry_price + stop_distance
            take_profit = entry_price + (stop_distance * risk_reward) if direction == 'LONG' else entry_price - (stop_distance * risk_reward)
        else:  # EXIT
            stop_loss = None
            take_profit = None
            entry_price = None
            risk_reward = None
        
        # Send signal based on mode
        if config.MODE in ['PAPER', 'LIVE']:
            try:
                result = self.supabase.send_signal(
                    action=action,
                    confidence=confidence,
                    asset=config.DEFAULT_ASSET,
                    video_id=video_id,
                    frame_index=frame_idx,
                    features_summary=features_summary,
                    model_version=config.MODEL_VERSION,
                    entry_price=entry_price,
                    stop_loss=stop_loss,
                    take_profit=take_profit,
                    risk_reward=risk_reward,
                    direction=direction
                )
                
                if 'error' not in result:
                    self.stats['signals_sent'] += 1
                    
                    if result.get('status') == 'executed':
                        self.stats['signals_executed'] += 1
                        logger.info("Signal executed successfully!")
                
            except Exception as e:
                logger.error(f"Error sending signal: {e}")
        
        else:  # SHADOW mode
            logger.info(f"SHADOW mode: Signal logged but not sent")
            logger.info(f"Features: {features_summary}")
    
    def process_playlist(self, playlist_url: str) -> int:
        """
        Process all videos from a playlist.
        
        Args:
            playlist_url: YouTube playlist URL
            
        Returns:
            Number of videos successfully processed
        """
        logger.info(f"Processing playlist: {playlist_url}")
        
        # Extract video URLs from playlist using yt-dlp
        import yt_dlp
        
        ydl_opts = {
            'quiet': True,
            'extract_flat': True,
            'force_generic_extractor': True
        }
        
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(playlist_url, download=False)
                
                if 'entries' not in info:
                    logger.error("No videos found in playlist")
                    return 0
                
                videos = [
                    f"https://www.youtube.com/watch?v={entry['id']}"
                    for entry in info['entries']
                    if entry
                ]
                
                logger.info(f"Found {len(videos)} videos in playlist")
                
                success_count = 0
                for i, video_url in enumerate(videos, 1):
                    logger.info(f"Processing video {i}/{len(videos)}")
                    
                    if self.process_video(video_url):
                        success_count += 1
                
                logger.info(f"Playlist processing completed: {success_count}/{len(videos)} successful")
                return success_count
                
        except Exception as e:
            logger.error(f"Error processing playlist: {e}")
            return 0
    
    def print_stats(self):
        """Print agent statistics."""
        logger.info("=== Vision Trading Agent Statistics ===")
        logger.info(f"Mode: {config.MODE}")
        logger.info(f"Frames processed: {self.stats['frames_processed']}")
        logger.info(f"Signals generated: {self.stats['signals_generated']}")
        logger.info(f"Signals sent: {self.stats['signals_sent']}")
        logger.info(f"Signals executed: {self.stats['signals_executed']}")
        logger.info("=" * 40)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Vision Trading Agent")
    
    parser.add_argument(
        '--mode',
        choices=['SHADOW', 'PAPER', 'LIVE'],
        default=None,
        help='Agent mode (default: uses config)'
    )
    
    parser.add_argument(
        '--video',
        type=str,
        help='YouTube video URL to process'
    )
    
    parser.add_argument(
        '--playlist',
        type=str,
        help='YouTube playlist URL to process'
    )
    
    parser.add_argument(
        '--model',
        type=str,
        help='Model version to use'
    )
    
    args = parser.parse_args()
    
    # Override config with CLI arguments
    if args.mode:
        config.MODE = args.mode
    
    if args.model:
        config.MODEL_VERSION = args.model
    
    try:
        agent = VisionTradingAgent()
        
        if args.playlist:
            agent.process_playlist(args.playlist)
        elif args.video:
            agent.process_video(args.video)
        else:
            # Daemon mode: read from stdin
            logger.info("Starting in daemon mode, waiting for input...")
            try:
                for line in sys.stdin:
                    line = line.strip()
                    if not line:
                        continue
                    
                    logger.info(f"Received command: {line}")
                    
                    if "list=" in line or "@" in line or "channel/" in line:
                         agent.process_playlist(line)
                    elif line.startswith("http"):
                         agent.process_video(line)
                    else:
                        logger.warning(f"Unknown command or invalid URL: {line}")
            except KeyboardInterrupt:
                logger.info("Daemon mode stopped")

        
        agent.cleanup()
        agent.print_stats()
        
    except KeyboardInterrupt:
        logger.info("Agent stopped by user")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
