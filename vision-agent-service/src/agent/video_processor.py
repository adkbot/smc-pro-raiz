"""Video processing module for Vision Trading Agent."""
import cv2
import numpy as np
from pathlib import Path
from typing import Generator, Tuple, Optional, Dict
import yt_dlp
from ..config import config
from ..utils import logger


class VideoProcessor:
    """Handles video download and frame extraction."""
    
    def __init__(self, video_dir: str = None):
        self.video_dir = Path(video_dir or config.VIDEOS_DIR)
        self.video_dir.mkdir(parents=True, exist_ok=True)
        
    def download_video(self, youtube_url: str, video_id: str) -> Optional[Path]:
        """
        Download video from YouTube using yt-dlp.
        
        Args:
            youtube_url: YouTube video URL
            video_id: Unique identifier for the video
            
        Returns:
            Path to downloaded video file or None if failed
        """
        video_path = self.video_dir / video_id
        video_path.mkdir(parents=True, exist_ok=True)
        
        output_path = video_path / "video.mp4"
        
        if output_path.exists():
            logger.info(f"Video already downloaded: {video_id}")
            return output_path
        
        ydl_opts = {
            'format': 'best[ext=mp4]/best',
            'outtmpl': str(output_path),
            'quiet': False,
            'no_warnings': False,
        }
        
        try:
            logger.info(f"Downloading video: {youtube_url}")
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(youtube_url, download=True)
                
                # Get video metadata
                duration = info.get('duration', 0)
                title = info.get('title', 'Unknown')
                channel = info.get('channel', 'Unknown')
                
                logger.info(f"Downloaded: {title} ({duration}s) from {channel}")
                
                # Validate duration
                if duration < config.MIN_VIDEO_DURATION:
                    logger.warning(f"Video too short: {duration}s < {config.MIN_VIDEO_DURATION}s")
                    return None
                
                if duration > config.MAX_VIDEO_DURATION:
                    logger.warning(f"Video too long: {duration}s > {config.MAX_VIDEO_DURATION}s")
                    return None
                
                return output_path
                
        except Exception as e:
            logger.error(f"Error downloading video: {e}")
            return None
    
    def extract_frames(
        self,
        video_path: Path,
        frame_step: int = None
    ) -> Generator[Tuple[int, np.ndarray], None, None]:
        """
        Extract frames from video.
        
        Args:
            video_path: Path to video file
            frame_step: Process every N frames (default: config.FRAME_STEP)
            
        Yields:
            Tuple of (frame_index, frame_array)
        """
        frame_step = frame_step or config.FRAME_STEP
        
        if not video_path.exists():
            logger.error(f"Video file not found: {video_path}")
            return
        
        cap = cv2.VideoCapture(str(video_path))
        
        if not cap.isOpened():
            logger.error(f"Failed to open video: {video_path}")
            return
        
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        
        logger.info(f"Processing video: {total_frames} frames @ {fps} FPS")
        logger.info(f"Frame step: {frame_step} (processing {total_frames // frame_step} frames)")
        
        frame_idx = 0
        processed = 0
        
        try:
            while True:
                ret, frame = cap.read()
                
                if not ret:
                    break
                
                # Process only every N frames
                if frame_idx % frame_step == 0:
                    yield frame_idx, frame
                    processed += 1
                
                frame_idx += 1
                
        finally:
            cap.release()
            logger.info(f"Processed {processed} frames from {total_frames} total frames")
    
    def get_video_info(self, video_path: Path) -> Dict:
        """
        Get video metadata.
        
        Args:
            video_path: Path to video file
            
        Returns:
            Dictionary with video info
        """
        cap = cv2.VideoCapture(str(video_path))
        
        info = {
            'total_frames': int(cap.get(cv2.CAP_PROP_FRAME_COUNT)),
            'fps': cap.get(cv2.CAP_PROP_FPS),
            'width': int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            'height': int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            'duration': int(cap.get(cv2.CAP_PROP_FRAME_COUNT) / cap.get(cv2.CAP_PROP_FPS))
        }
        
        cap.release()
        return info
    
    def save_frame(self, frame: np.ndarray, output_path: Path):
        """Save a single frame as image."""
        cv2.imwrite(str(output_path), frame)
    
    def create_video_from_frames(
        self,
        frames: list,
        output_path: Path,
        fps: float = 30.0
    ):
        """
        Create video from list of frames.
        
        Args:
            frames: List of frame arrays
            output_path: Output video path
            fps: Frames per second
        """
        if not frames:
            return
        
        height, width = frames[0].shape[:2]
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))
        
        for frame in frames:
            out.write(frame)
        
        out.release()
        logger.info(f"Created video: {output_path} ({len(frames)} frames @ {fps} FPS)")


class FrameBuffer:
    """Manages a sliding window buffer of frames for sequence processing."""
    
    def __init__(self, sequence_length: int = None):
        self.sequence_length = sequence_length or config.SEQUENCE_LENGTH
        self.buffer = []
        
    def add(self, frame_data: dict):
        """Add frame features to buffer."""
        self.buffer.append(frame_data)
        
        # Keep only last N frames
        if len(self.buffer) > self.sequence_length:
            self.buffer.pop(0)
    
    def is_ready(self) -> bool:
        """Check if buffer has enough frames for inference."""
        return len(self.buffer) >= self.sequence_length
    
    def get_sequence(self) -> np.ndarray:
        """
        Get sequence as numpy array.
        
        Returns:
            Array of shape (sequence_length, feature_dim)
        """
        if not self.is_ready():
            return None
        
        # Stack feature vectors from last N frames
        features = [frame['features'] for frame in self.buffer[-self.sequence_length:]]
        return np.array(features)
    
    def clear(self):
        """Clear the buffer."""
        self.buffer = []
    
    def __len__(self):
        return len(self.buffer)
