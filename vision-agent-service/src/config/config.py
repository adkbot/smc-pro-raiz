"""Configuration module for Vision Trading Agent."""
import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class VisionAgentConfig:
    """Main configuration class for Vision Trading Agent."""
    
    # Supabase Configuration
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    SUPABASE_USER_ID: str = os.getenv("SUPABASE_USER_ID", "")
    
    # Agent Mode
    MODE: str = os.getenv("AGENT_MODE", "SHADOW")  # SHADOW, PAPER, LIVE
    
    # Video Processing
    FRAME_STEP: int = int(os.getenv("FRAME_STEP", "5"))  # Process every N frames
    MIN_VIDEO_DURATION: int = int(os.getenv("MIN_VIDEO_DURATION", "60"))  # seconds
    MAX_VIDEO_DURATION: int = int(os.getenv("MAX_VIDEO_DURATION", "3600"))  # seconds
    
    # Feature Extraction
    SEQUENCE_LENGTH: int = int(os.getenv("SEQUENCE_LENGTH", "30"))  # Number of frames in sequence
    FEATURE_DIM: int = 128  # Fixed feature vector dimension
    
    # Model Configuration
    MODEL_VERSION: str = os.getenv("MODEL_VERSION", "model_seq_v20251125.h5")
    CONFIDENCE_THRESHOLD: float = float(os.getenv("CONFIDENCE_THRESHOLD", "0.70"))
    
    # OCR Configuration
    TESSERACT_PATH: Optional[str] = os.getenv("TESSERACT_PATH", None)
    OCR_LANG: str = "eng+por"  # English + Portuguese
    
    # YOLO Configuration
    YOLO_MODEL_PATH: str = "models/yolo_arrows.pt"
    YOLO_CONFIDENCE: float = 0.5
    
    # MediaPipe Configuration
    MEDIAPIPE_MIN_DETECTION_CONFIDENCE: float = 0.5
    MEDIAPIPE_MIN_TRACKING_CONFIDENCE: float = 0.5
    
    # Signal Generation
    MAX_SIGNALS_PER_DAY: int = int(os.getenv("MAX_SIGNALS_PER_DAY", "50"))
    
    # Trading Parameters
    DEFAULT_ASSET: str = "BTCUSDT"
    DEFAULT_RR: float = 2.0  # Risk:Reward ratio
    
    # Directories
    VIDEOS_DIR: str = "videos"
    FEATURES_DIR: str = "data/features"
    TRAINING_DIR: str = "data/training"
    MODELS_DIR: str = "models"
    LOGS_DIR: str = "logs"
    
    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    
    def validate(self) -> bool:
        """Validate configuration."""
        if not self.SUPABASE_URL or not self.SUPABASE_SERVICE_ROLE_KEY:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
        
        if self.MODE not in ["SHADOW", "PAPER", "LIVE"]:
            raise ValueError(f"Invalid MODE: {self.MODE}. Must be SHADOW, PAPER, or LIVE")
        
        if self.CONFIDENCE_THRESHOLD < 0.5 or self.CONFIDENCE_THRESHOLD > 1.0:
            raise ValueError("CONFIDENCE_THRESHOLD must be between 0.5 and 1.0")
        
        return True


# Global config instance
config = VisionAgentConfig()
