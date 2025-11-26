"""Logging utilities for Vision Trading Agent."""
import logging
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional


class AgentLogger:
    """Custom logger for Vision Trading Agent."""
    
    def __init__(self, name: str, log_dir: str = "logs", level: str = "INFO"):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(getattr(logging, level.upper()))
        
        # Create logs directory
        log_path = Path(log_dir)
        log_path.mkdir(parents=True, exist_ok=True)
        
        # File handler
        log_file = log_path / f"agent_{datetime.now().strftime('%Y%m%d')}.log"
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(logging.DEBUG)
        
        # Console handler
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(getattr(logging, level.upper()))
        
        # Formatter
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        file_handler.setFormatter(formatter)
        console_handler.setFormatter(formatter)
        
        # Add handlers
        if not self.logger.handlers:
            self.logger.addHandler(file_handler)
            self.logger.addHandler(console_handler)
    
    def debug(self, message: str, **kwargs):
        self.logger.debug(message, extra=kwargs)
    
    def info(self, message: str, **kwargs):
        self.logger.info(message, extra=kwargs)
    
    def warning(self, message: str, **kwargs):
        self.logger.warning(message, extra=kwargs)
    
    def error(self, message: str, **kwargs):
        self.logger.error(message, extra=kwargs)
    
    def critical(self, message: str, **kwargs):
        self.logger.critical(message, extra=kwargs)


# Global logger instance
logger = AgentLogger("VisionTradingAgent")
