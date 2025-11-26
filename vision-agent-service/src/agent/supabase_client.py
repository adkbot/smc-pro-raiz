"""Supabase client for Vision Trading Agent."""
import requests
from typing import Dict, Optional
from datetime import datetime

from ..config import config
from ..utils import logger


class SupabaseClient:
    """Handles communication with Supabase Edge Functions and database."""
    
    def __init__(self):
        self.base_url = config.SUPABASE_URL
        self.service_key = config.SUPABASE_SERVICE_ROLE_KEY
        self.user_id = config.SUPABASE_USER_ID
        
        if not self.base_url or not self.service_key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        
        self.headers = {
            'Authorization': f'Bearer {self.service_key}',
            'apikey': self.service_key,
            'Content-Type': 'application/json'
        }
    
    def send_signal(
        self,
        action: str,
        confidence: float,
        asset: str,
        video_id: str,
        frame_index: int,
        features_summary: Dict,
        model_version: str,
        entry_price: float = None,
        stop_loss: float = None,
        take_profit: float = None,
        risk_reward: float = None,
        direction: str = 'LONG'
    ) -> Dict:
        """
        Send signal to Supabase Edge Function.
        
        Args:
            action: 'ENTER', 'EXIT', or 'IGNORE'
            confidence: Confidence score (0-1)
            asset: Trading asset (e.g., 'BTCUSDT')
            video_id: YouTube video ID
            frame_index: Frame index in video
            features_summary: Dictionary with extracted features
            model_version: Model version string
            entry_price: Entry price (if applicable)
            stop_loss: Stop loss price
            take_profit: Take profit price
            risk_reward: Risk/reward ratio
            direction: 'LONG' or 'SHORT'
            
        Returns:
            Response from Edge Function
        """
        payload = {
            'user_id': self.user_id,
            'action': action,
            'confidence': confidence,
            'asset': asset,
            'video_id': video_id,
            'frame_index': frame_index,
            'timestamp_in_video': int(frame_index / 30),  # Assuming 30 FPS
            'features_summary': features_summary,
            'model_version': model_version,
            'direction': direction
        }
        
        if entry_price is not None:
            payload['entry_price'] = entry_price
        if stop_loss is not None:
            payload['stop_loss'] = stop_loss
        if take_profit is not None:
            payload['take_profit'] = take_profit
        if risk_reward is not None:
            payload['risk_reward'] = risk_reward
        
        url = f"{self.base_url}/functions/v1/vision-agent-signal"
        
        try:
            logger.info(f"Sending signal: {action} | {asset} | Confidence: {confidence:.2f}")
            
            response = requests.post(url, json=payload, headers=self.headers, timeout=10)
            response.raise_for_status()
            
            result = response.json()
            logger.info(f"Signal sent successfully: {result.get('status')}")
            
            return result
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error sending signal: {e}")
            if hasattr(e, 'response') and e.response is not None:
                logger.error(f"Response: {e.response.text}")
            return {'error': str(e)}
    
    def update_video_status(
        self,
        video_id: str,
        status: str,
        processed_frames: int = None,
        signals_generated: int = None,
        error_message: str = None
    ) -> bool:
        """
        Update video processing status in database.
        
        Args:
            video_id: YouTube video ID
            status: 'pending', 'processing', 'completed', 'failed'
            processed_frames: Number of frames processed
            signals_generated: Number of signals generated
            error_message: Error message if failed
            
        Returns:
            True if successful, False otherwise
        """
        url = f"{self.base_url}/rest/v1/vision_agent_videos"
        
        # Find record by video_id and user_id
        params = {
            'video_id': f'eq.{video_id}',
            'user_id': f'eq.{self.user_id}',
            'select': 'id'
        }
        
        try:
            # Get existing record
            response = requests.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            records = response.json()
            
            if not records:
                logger.warning(f"Video record not found: {video_id}")
                return False
            
            record_id = records[0]['id']
            
            # Update record
            update_data = {
                'status': status,
                'updated_at': datetime.utcnow().isoformat()
            }
            
            if processed_frames is not None:
                update_data['processed_frames'] = processed_frames
            
            if signals_generated is not None:
                update_data['signals_generated'] = signals_generated
            
            if error_message is not None:
                update_data['error_message'] = error_message
            
            if status == 'processing' and processed_frames == 0:
                update_data['processing_started_at'] = datetime.utcnow().isoformat()
            
            if status in ['completed', 'failed']:
                update_data['processing_completed_at'] = datetime.utcnow().isoformat()
            
            update_url = f"{url}?id=eq.{record_id}"
            response = requests.patch(update_url, json=update_data, headers=self.headers)
            response.raise_for_status()
            
            logger.debug(f"Video status updated: {video_id} -> {status}")
            return True
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error updating video status: {e}")
            return False
    
    def create_video_record(
        self,
        video_id: str,
        youtube_url: str,
        title: str = None,
        channel: str = None,
        total_frames: int = None
    ) -> Optional[str]:
        """
        Create video record in database.
        
        Returns:
            Record UUID or None if failed
        """
        url = f"{self.base_url}/rest/v1/vision_agent_videos"
        
        data = {
            'user_id': self.user_id,
            'video_id': video_id,
            'youtube_url': youtube_url,
            'title': title,
            'channel': channel,
            'status': 'pending',
            'total_frames': total_frames,
            'model_version': config.MODEL_VERSION
        }
        
        try:
            response = requests.post(url, json=data, headers=self.headers)
            response.raise_for_status()
            
            result = response.json()
            if result and len(result) > 0:
                logger.info(f"Video record created: {video_id}")
                return result[0]['id']
            
            return None
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error creating video record: {e}")
            return None
    
    def get_settings(self) -> Optional[Dict]:
        """
        Get Vision Agent settings for user.
        
        Returns:
            Settings dictionary or None if not found
        """
        url = f"{self.base_url}/rest/v1/vision_agent_settings"
        params = {
            'user_id': f'eq.{self.user_id}',
            'select': '*'
        }
        
        try:
            response = requests.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            
            results = response.json()
            if results and len(results) > 0:
                return results[0]
            
            return None
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching settings: {e}")
            return None
