"""Model inference module for sequence classification."""
import numpy as np
from pathlib import Path
from typing import Tuple, Optional
import tensorflow as tf
import keras

from ..config import config
from ..utils import logger


class ModelInference:
    """Handles model loading and inference for action classification."""
    
    # Action labels
    ACTIONS = ['IGNORE', 'ENTER', 'EXIT']
    
    def __init__(self, model_path: str = None):
        self.model_path = Path(model_path or config.MODELS_DIR) / config.MODEL_VERSION
        self.model = None
        self.load_model()
    
    def load_model(self):
        """Load trained model from disk."""
        if not self.model_path.exists():
            logger.warning(f"Model not found: {self.model_path}")
            logger.warning("Using dummy model for testing. Train a model first!")
            self.model = self._create_dummy_model()
            return
        
        try:
            self.model = keras.models.load_model(str(self.model_path))
            logger.info(f"Model loaded: {self.model_path}")
        except Exception as e:
            logger.error(f"Error loading model: {e}")
            logger.warning("Using dummy model instead")
            self.model = self._create_dummy_model()
    
    def _create_dummy_model(self) -> keras.Model:
        """Create a dummy model for testing."""
        model = keras.Sequential([
            keras.layers.Input(shape=(config.SEQUENCE_LENGTH, config.FEATURE_DIM)),
            keras.layers.LSTM(64, return_sequences=True),
            keras.layers.LSTM(32),
            keras.layers.Dense(32, activation='relu'),
            keras.layers.Dropout(0.3),
            keras.layers.Dense(len(self.ACTIONS), activation='softmax')
        ])
        
        # Compile with random weights
        model.compile(
            optimizer='adam',
            loss='categorical_crossentropy',
            metrics=['accuracy']
        )
        
        logger.warning("Dummy model created - predictions will be random!")
        return model
    
    def predict(self, sequence: np.ndarray) -> Tuple[str, float]:
        """
        Predict action from sequence of frames.
        
        Args:
            sequence: Array of shape (sequence_length, feature_dim)
            
        Returns:
            Tuple of (action, confidence)
            action: One of ACTIONS
            confidence: Probability score (0-1)
        """
        if self.model is None:
            logger.error("Model not loaded")
            return 'IGNORE', 0.0
        
        try:
            # Add batch dimension
            if len(sequence.shape) == 2:
                sequence = np.expand_dims(sequence, axis=0)
            
            # Predict
            predictions = self.model.predict(sequence, verbose=0)
            
            # Get action with highest probability
            action_idx = np.argmax(predictions[0])
            confidence = float(predictions[0][action_idx])
            action = self.ACTIONS[action_idx]
            
            logger.debug(f"Prediction: {action} ({confidence:.2f})")
            logger.debug(f"All probabilities: {dict(zip(self.ACTIONS, predictions[0]))}")
            
            return action, confidence
            
        except Exception as e:
            logger.error(f"Prediction error: {e}")
            return 'IGNORE', 0.0
    
    def predict_batch(self, sequences: np.ndarray) -> list:
        """
        Predict actions for multiple sequences.
        
        Args:
            sequences: Array of shape (batch_size, sequence_length, feature_dim)
            
        Returns:
            List of (action, confidence) tuples
        """
        if self.model is None:
            return [('IGNORE', 0.0)] * len(sequences)
        
        try:
            predictions = self.model.predict(sequences, verbose=0)
            
            results = []
            for pred in predictions:
                action_idx = np.argmax(pred)
                confidence = float(pred[action_idx])
                action = self.ACTIONS[action_idx]
                results.append((action, confidence))
            
            return results
            
        except Exception as e:
            logger.error(f"Batch prediction error: {e}")
            return [('IGNORE', 0.0)] * len(sequences)
    
    def evaluate(self, X_test: np.ndarray, y_test: np.ndarray) -> dict:
        """
        Evaluate model on test data.
        
        Args:
            X_test: Test sequences
            y_test: True labels (one-hot encoded)
            
        Returns:
            Dictionary with metrics
        """
        if self.model is None:
            return {'error': 'Model not loaded'}
        
        try:
            loss, accuracy = self.model.evaluate(X_test, y_test, verbose=0)
            
            # Get predictions
            predictions = self.model.predict(X_test, verbose=0)
            y_pred = np.argmax(predictions, axis=1)
            y_true = np.argmax(y_test, axis=1)
            
            # Calculate per-class metrics
            from sklearn.metrics import classification_report, confusion_matrix
            
            report = classification_report(
                y_true,
                y_pred,
                target_names=self.ACTIONS,
                output_dict=True
            )
            
            cm = confusion_matrix(y_true, y_pred)
            
            return {
                'loss': float(loss),
                'accuracy': float(accuracy),
                'report': report,
                'confusion_matrix': cm.tolist()
            }
            
        except Exception as e:
            logger.error(f"Evaluation error: {e}")
            return {'error': str(e)}


class ModelTrainer:
    """Handles model training and re-training."""
    
    def __init__(self):
        self.model = None
    
    def build_model(self, architecture: str = 'lstm') -> keras.Model:
        """
        Build model architecture.
        
        Args:
            architecture: 'lstm' or 'transformer'
            
        Returns:
            Compiled Keras model
        """
        if architecture == 'lstm':
            model = self._build_lstm_model()
        elif architecture == 'transformer':
            model = self._build_transformer_model()
        else:
            raise ValueError(f"Unknown architecture: {architecture}")
        
        self.model = model
        return model
    
    def _build_lstm_model(self) -> keras.Model:
        """Build LSTM-based model."""
        model = keras.Sequential([
            keras.layers.Input(shape=(config.SEQUENCE_LENGTH, config.FEATURE_DIM)),
            keras.layers.LSTM(128, return_sequences=True),
            keras.layers.Dropout(0.3),
            keras.layers.LSTM(64, return_sequences=True),
            keras.layers.Dropout(0.3),
            keras.layers.LSTM(32),
            keras.layers.Dense(64, activation='relu'),
            keras.layers.Dropout(0.3),
            keras.layers.Dense(3, activation='softmax')  # IGNORE, ENTER, EXIT
        ])
        
        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=0.001),
            loss='categorical_crossentropy',
            metrics=['accuracy']
        )
        
        logger.info(f"LSTM model built: {model.count_params()} parameters")
        return model
    
    def _build_transformer_model(self) -> keras.Model:
        """Build Transformer-based model."""
        # Simplified transformer architecture
        inputs = keras.layers.Input(shape=(config.SEQUENCE_LENGTH, config.FEATURE_DIM))
        
        # Multi-head attention
        x = keras.layers.MultiHeadAttention(
            num_heads=4,
            key_dim=config.FEATURE_DIM // 4
        )(inputs, inputs)
        
        x = keras.layers.LayerNormalization()(x)
        x = keras.layers.Dropout(0.2)(x)
        
        # Feed-forward
        x = keras.layers.GlobalAveragePooling1D()(x)
        x = keras.layers.Dense(128, activation='relu')(x)
        x = keras.layers.Dropout(0.3)(x)
        x = keras.layers.Dense(64, activation='relu')(x)
        x = keras.layers.Dropout(0.3)(x)
        
        outputs = keras.layers.Dense(3, activation='softmax')(x)
        
        model = keras.Model(inputs=inputs, outputs=outputs)
        
        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=0.001),
            loss='categorical_crossentropy',
            metrics=['accuracy']
        )
        
        logger.info(f"Transformer model built: {model.count_params()} parameters")
        return model
    
    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray,
        epochs: int = 50,
        batch_size: int = 32
    ) -> dict:
        """
        Train the model.
        
        Args:
            X_train: Training sequences
            y_train: Training labels (one-hot encoded)
            X_val: Validation sequences
            y_val: Validation labels
            epochs: Number of training epochs
            batch_size: Batch size
            
        Returns:
            Training history
        """
        if self.model is None:
            raise ValueError("Model not built. Call build_model() first.")
        
        callbacks = [
            keras.callbacks.EarlyStopping(
                patience=10,
                restore_best_weights=True,
                monitor='val_loss'
            ),
            keras.callbacks.ReduceLROnPlateau(
                factor=0.5,
                patience=5,
                monitor='val_loss'
            )
        ]
        
        logger.info(f"Training model: {epochs} epochs, batch size {batch_size}")
        logger.info(f"Training samples: {len(X_train)}, Validation samples: {len(X_val)}")
        
        history = self.model.fit(
            X_train,
            y_train,
            validation_data=(X_val, y_val),
            epochs=epochs,
            batch_size=batch_size,
            callbacks=callbacks,
            verbose=1
        )
        
        return history.history
    
    def save_model(self, model_path: Path = None):
        """Save trained model."""
        if self.model is None:
            raise ValueError("No model to save")
        
        model_path = model_path or (Path(config.MODELS_DIR) / config.MODEL_VERSION)
        model_path.parent.mkdir(parents=True, exist_ok=True)
        
        self.model.save(str(model_path))
        logger.info(f"Model saved: {model_path}")
