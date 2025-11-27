"""Feature extraction module using MediaPipe, OpenCV, OCR, and YOLO."""
import cv2
import numpy as np
import mediapipe as mp
import pytesseract
from typing import Dict, List, Tuple, Optional
from pathlib import Path

try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False

from ..config import config
from ..utils import logger


class FeatureExtractor:
    """Extracts visual features from video frames."""
    
    def __init__(self):
        # MediaPipe Hands
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=2,
            min_detection_confidence=config.MEDIAPIPE_MIN_DETECTION_CONFIDENCE,
            min_tracking_confidence=config.MEDIAPIPE_MIN_TRACKING_CONFIDENCE
        )
        
        # YOLO (if available and model exists)
        self.yolo_model = None
        if YOLO_AVAILABLE and Path(config.YOLO_MODEL_PATH).exists():
            try:
                self.yolo_model = YOLO(config.YOLO_MODEL_PATH)
                logger.info("YOLO model loaded successfully")
            except Exception as e:
                logger.warning(f"Failed to load YOLO model: {e}")
        
        # Set Tesseract path if provided
        if config.TESSERACT_PATH:
            pytesseract.pytesseract.tesseract_cmd = config.TESSERACT_PATH
        
        # Previous frame for motion detection
        self.prev_gray = None
        
        # Cache for expensive features
        self.last_text_features = {
            'text_detected': False,
            'text': '',
            'numbers': [],
            'words': []
        }
    
    def extract_features(self, frame: np.ndarray, frame_idx: int) -> Dict:
        """
        Extract all features from a single frame.
        
        Args:
            frame: Frame array (BGR format from OpenCV)
            frame_idx: Frame index in video
            
        Returns:
            Dictionary with all extracted features
        """
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Determine if we should run OCR this frame
        # We run OCR only every OCR_INTERVAL processed frames to save time
        processed_frame_count = frame_idx // config.FRAME_STEP
        run_ocr = (processed_frame_count % config.OCR_INTERVAL == 0)
        
        if run_ocr:
            self.last_text_features = self._extract_text(gray_frame)
        
        features = {
            'frame_idx': frame_idx,
            'hands': self._extract_hands(rgb_frame),
            'drawings': self._extract_drawings(gray_frame),
            'text': self.last_text_features, # Use current or cached text features
            'arrows': self._extract_arrows(frame),
            'motion': self._extract_motion(gray_frame)
        }
        
        # Build feature vector
        features['vector'] = self._build_feature_vector(features)
        
        return features
    
    def _extract_hands(self, rgb_frame: np.ndarray) -> Dict:
        """Extract hand landmarks using MediaPipe."""
        results = self.hands.process(rgb_frame)
        
        hands_data = {
            'detected': False,
            'count': 0,
            'landmarks': [],
            'gestures': []
        }
        
        if results.multi_hand_landmarks:
            hands_data['detected'] = True
            hands_data['count'] = len(results.multi_hand_landmarks)
            
            for hand_landmarks in results.multi_hand_landmarks:
                # Extract 21 landmarks (x, y, z) for each hand
                landmarks = []
                for landmark in hand_landmarks.landmark:
                    landmarks.extend([landmark.x, landmark.y, landmark.z])
                
                hands_data['landmarks'].append(landmarks)
                
                # Detect simple gestures (pointing, open hand, etc.)
                gesture = self._detect_gesture(landmarks)
                hands_data['gestures'].append(gesture)
        
        return hands_data
    
    def _detect_gesture(self, landmarks: List[float]) -> str:
        """
        Detect simple hand gesture from landmarks.
        
        Gestures:
        - pointing: index finger extended
        - open: all fingers extended
        - closed: all fingers closed
        """
        # Simple heuristic: compare finger tip positions with base positions
        # This is a simplified version - can be improved
        return 'unknown'
    
    def _extract_drawings(self, gray_frame: np.ndarray) -> Dict:
        """Extract drawings/lines using frame differencing and edge detection."""
        drawings = {
            'lines_detected': False,
            'line_count': 0,
            'areas': [],
            'changes': 0
        }
        
        # Edge detection
        edges = cv2.Canny(gray_frame, 50, 150)
        
        # Detect lines using Hough Transform
        lines = cv2.HoughLinesP(
            edges,
            rho=1,
            theta=np.pi/180,
            threshold=50,
            minLineLength=30,
            maxLineGap=10
        )
        
        if lines is not None:
            drawings['lines_detected'] = True
            drawings['line_count'] = len(lines)
        
        # Frame differencing to detect new drawings
        if self.prev_gray is not None:
            diff = cv2.absdiff(self.prev_gray, gray_frame)
            _, thresh = cv2.threshold(diff, 30, 255, cv2.THRESH_BINARY)
            
            # Find contours of changes
            contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            drawings['changes'] = len(contours)
            
            for contour in contours:
                area = cv2.contourArea(contour)
                if area > 100:  # Filter small noise
                    drawings['areas'].append(area)
        
        self.prev_gray = gray_frame.copy()
        
        return drawings
    
    def _extract_text(self, gray_frame: np.ndarray) -> Dict:
        """Extract text using Tesseract OCR."""
        text_data = {
            'text_detected': False,
            'text': '',
            'numbers': [],
            'words': []
        }
        
        try:
            # Apply preprocessing for better OCR
            _, binary = cv2.threshold(gray_frame, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            
            # Extract text
            text = pytesseract.image_to_string(
                binary,
                lang=config.OCR_LANG,
                config='--psm 6'
            ).strip()
            
            if text:
                text_data['text_detected'] = True
                text_data['text'] = text
                text_data['words'] = text.split()
                
                # Extract numbers (potential price levels)
                import re
                numbers = re.findall(r'\d+\.?\d*', text)
                text_data['numbers'] = [float(n) for n in numbers if n]
        
        except Exception as e:
            logger.debug(f"OCR error: {e}")
        
        return text_data
    
    def _extract_arrows(self, frame: np.ndarray) -> Dict:
        """Extract arrows/shapes using YOLO (if available)."""
        arrows_data = {
            'arrows_detected': False,
            'count': 0,
            'directions': [],
            'confidence': []
        }
        
        if self.yolo_model is None:
            return arrows_data
        
        try:
            results = self.yolo_model(frame, verbose=False)
            
            for result in results:
                if result.boxes is not None and len(result.boxes) > 0:
                    arrows_data['arrows_detected'] = True
                    arrows_data['count'] = len(result.boxes)
                    
                    for box in result.boxes:
                        conf = float(box.conf[0])
                        if conf >= config.YOLO_CONFIDENCE:
                            arrows_data['confidence'].append(conf)
                            # Direction could be inferred from box position/angle
                            arrows_data['directions'].append('unknown')
        
        except Exception as e:
            logger.debug(f"YOLO error: {e}")
        
        return arrows_data
    
    def _extract_motion(self, gray_frame: np.ndarray) -> Dict:
        """Extract motion/cursor movement."""
        motion_data = {
            'motion_detected': False,
            'magnitude': 0.0
        }
        
        if self.prev_gray is not None:
            # Calculate optical flow
            flow = cv2.calcOpticalFlowFarneback(
                self.prev_gray,
                gray_frame,
                None,
                0.5, 3, 15, 3, 5, 1.2, 0
            )
            
            magnitude, _ = cv2.cartToPolar(flow[..., 0], flow[..., 1])
            motion_data['magnitude'] = float(np.mean(magnitude))
            motion_data['motion_detected'] = motion_data['magnitude'] > 1.0
        
        return motion_data
    
    def _build_feature_vector(self, features: Dict) -> np.ndarray:
        """
        Build fixed-size feature vector from extracted features.
        
        Returns:
            NumPy array of shape (FEATURE_DIM,)
        """
        vector = []
        
        # Hands features (63 values: up to 2 hands * 21 landmarks * 3 coords, padded)
        hands_features = np.zeros(63)
        if features['hands']['detected']:
            for i, landmarks in enumerate(features['hands']['landmarks'][:2]):
                start_idx = i * 21 * 3
                hands_features[start_idx:start_idx + len(landmarks)] = landmarks[:63 - start_idx]
        vector.extend(hands_features)
        
        # Drawings features (5 values)
        vector.extend([
            float(features['drawings']['lines_detected']),
            min(features['drawings']['line_count'], 100) / 100.0,  # Normalize
            min(features['drawings']['changes'], 50) / 50.0,
            np.mean(features['drawings']['areas']) / 1000.0 if features['drawings']['areas'] else 0.0,
            len(features['drawings']['areas']) / 10.0
        ])
        
        # Text features (5 values)
        vector.extend([
            float(features['text']['text_detected']),
            len(features['text']['words']) / 10.0,
            len(features['text']['numbers']) / 5.0,
            float(any(w.lower() in ['enter', 'buy', 'compra', 'comprar', 'entrar'] for w in features['text']['words'])),
            float(any(w.lower() in ['exit', 'sell', 'venda', 'vender', 'sair', 'fechar'] for w in features['text']['words']))
        ])
        
        # Arrows features (3 values)
        vector.extend([
            float(features['arrows']['arrows_detected']),
            min(features['arrows']['count'], 10) / 10.0,
            np.mean(features['arrows']['confidence']) if features['arrows']['confidence'] else 0.0
        ])
        
        # Motion features (2 values)
        vector.extend([
            float(features['motion']['motion_detected']),
            min(features['motion']['magnitude'], 10.0) / 10.0
        ])
        
        # Pad or truncate to FEATURE_DIM
        vector = np.array(vector, dtype=np.float32)
        
        if len(vector) < config.FEATURE_DIM:
            vector = np.pad(vector, (0, config.FEATURE_DIM - len(vector)), mode='constant')
        elif len(vector) > config.FEATURE_DIM:
            vector = vector[:config.FEATURE_DIM]
        
        return vector
    
    def cleanup(self):
        """Release resources."""
        if self.hands:
            self.hands.close()
