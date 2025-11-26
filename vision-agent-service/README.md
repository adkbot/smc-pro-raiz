# Vision Trading Agent

## Overview

The **Vision Trading Agent** is an intelligent computer vision and machine learning system that:

1. **Automatically watches YouTube videos** from trading channels
2. **Detects visual patterns** using:
   - MediaPipe (hand gestures)
   - OpenCV (drawings, lines, markings)
   - YOLO (arrows, shapes)
   - Tesseract OCR (price levels, text)
3. **Processes frames sequentially** to create temporal feature vectors
4. **Classifies actions** using LSTM/Transformer models:
   - **ENTER** (enter position)
   - **EXIT** (exit position)
   - **IGNORE** (no action)
5. **Sends real-time signals** to the SMC Alpha Dashboard
6. **Continuously evolves** through periodic re-training

---

## Features

- 👁️ **Computer Vision**: Detects hands, drawings, text, and arrows in videos
- 🧠 **Machine Learning**: LSTM/Transformer models for sequence classification
- 📈 **Real-time Signals**: Sends trading signals to Supabase dashboard
- 🛡️ **Safety Modes**: SHADOW (observe only), PAPER (simulate), LIVE (execute)
- 🔄 **Continuous Learning**: Re-trains with new data periodically
- 📊 **Analytics**: Comprehensive logging and statistics

---

## Architecture

```
┌───────────────────────────┐
│  YouTube Video Download   │
│       (yt-dlp)            │
└─────────┬─────────────────┘
         │
┌────────┴─────────┐
│  Frame Extraction  │
│    (OpenCV)       │
└────────┬─────────┘
         │
┌────────┴───────────────────────────┐
│     Feature Extraction         │
│  - MediaPipe (hands)           │
│  - OpenCV (drawings)           │
│  - Tesseract (text/numbers)    │
│  - YOLO (arrows/shapes)        │
└────────┬───────────────────────────┘
         │
┌────────┴────────────────┐
│   Sequential Buffer    │
│   (N frames window)    │
└────────┬─────────────────┘
         │
┌────────┴───────────────────┐
│   LSTM/Transformer Model   │
│  ENTER / EXIT / IGNORE    │
└────────┬───────────────────┘
         │
┌────────┴───────────────────┐
│   Safety Validations      │
│  (confidence, limits)    │
└────────┬───────────────────┘
         │
┌────────┴───────────────────┐
│  Send Signal to Supabase │
│   (Edge Function)        │
└────────┬───────────────────┘
         │
┌────────┴────────────────────────┐
│   SMC Alpha Dashboard      │
│  (Execute or Log Signal)  │
└─────────────────────────────────┘
```

---

## Installation

### 1. System Requirements

- **Python**: 3.10 or higher
- **Tesseract OCR**: Install system-wide
  - Ubuntu/Debian: `sudo apt-get install tesseract-ocr`
  - macOS: `brew install tesseract`
  - Windows: Download from [GitHub](https://github.com/UB-Mannheim/tesseract/wiki)

### 2. Install Python Dependencies

```bash
cd vision-agent-service
pip install -r requirements.txt
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your Supabase credentials
```

---

## Usage

### Process a Single Video

```bash
python -m src.main --video "https://www.youtube.com/watch?v=VIDEO_ID" --mode SHADOW
```

### Process a Playlist

```bash
python -m src.main --playlist "https://www.youtube.com/playlist?list=PLAYLIST_ID" --mode PAPER
```

### Use Specific Model

```bash
python -m src.main --video "URL" --model "model_seq_v20251201.h5"
```

---

## Operation Modes

### 👁️ SHADOW Mode (Default)

- **Observes only**: Processes videos and generates signals
- **No execution**: Signals are logged locally but not sent to dashboard
- **Purpose**: Testing, validation, data collection
- **Safe**: Cannot affect trading

```bash
python -m src.main --video "URL" --mode SHADOW
```

### 📄 PAPER Mode

- **Simulates trading**: Sends signals to dashboard in paper mode
- **No real money**: Trades are simulated
- **Purpose**: Validate signal quality and timing
- **Safe**: Paper trading only

```bash
python -m src.main --video "URL" --mode PAPER
```

### 💰 LIVE Mode

- **⚠️ REAL TRADING**: Executes actual trades with real money
- **Dangerous**: Can result in financial loss
- **Requirements**:
  - Model must be extensively validated
  - High precision and recall metrics
  - Proven profitability in paper mode
  - All safety validations active

```bash
# Use with extreme caution!
python -m src.main --video "URL" --mode LIVE
```

---

## Training a Model

The agent includes model training utilities. See `docs/TRAINING.md` for detailed instructions.

**Quick start:**

```python
from src.agent.model_inference import ModelTrainer
import numpy as np

# Load your training data
X_train = np.load('data/training/X_train.npy')
y_train = np.load('data/training/y_train.npy')
X_val = np.load('data/training/X_val.npy')
y_val = np.load('data/training/y_val.npy')

# Build and train model
trainer = ModelTrainer()
trainer.build_model('lstm')  # or 'transformer'
history = trainer.train(X_train, y_train, X_val, y_val, epochs=50)

# Save model
trainer.save_model()
```

---

## Configuration

All configuration is managed through environment variables or `src/config/config.py`.

### Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `AGENT_MODE` | `SHADOW` | Operating mode (SHADOW/PAPER/LIVE) |
| `CONFIDENCE_THRESHOLD` | `0.70` | Minimum confidence to accept signal |
| `FRAME_STEP` | `5` | Process every N frames |
| `SEQUENCE_LENGTH` | `30` | Number of frames in sequence |
| `MAX_SIGNALS_PER_DAY` | `50` | Daily signal limit |
| `MODEL_VERSION` | `model_seq_v20251125.h5` | Model filename |

---

## Safety Features

1. **Confidence Threshold**: Signals below threshold are rejected
2. **Daily Limits**: Maximum signals per day
3. **Mode Isolation**: SHADOW mode cannot execute trades
4. **Validation Checks**: Multiple safety validations before execution
5. **Comprehensive Logging**: All actions are logged for audit
6. **Graceful Degradation**: Errors don't crash the agent

---

## Logging

Logs are written to:
- **Console**: INFO level and above
- **File**: `logs/agent_YYYYMMDD.log` (DEBUG level)

Log format:
```
2025-11-25 14:30:15 - VisionTradingAgent - INFO - Processing video: abc123
```

---

## Project Structure

```
vision-agent-service/
├── src/
│   ├── agent/
│   │   ├── video_processor.py      # Video download & frame extraction
│   │   ├── feature_extractor.py    # MediaPipe, OpenCV, OCR, YOLO
│   │   ├── model_inference.py      # LSTM/Transformer inference
│   │   ├── supabase_client.py      # Supabase communication
│   │   └── __init__.py
│   ├── config/
│   │   ├── config.py               # Configuration management
│   │   └── __init__.py
│   ├── utils/
│   │   ├── logger.py               # Logging utilities
│   │   └── __init__.py
│   └── main.py                     # Main entry point
├── models/
│   └── model_seq_v20251125.h5      # Trained model
├── videos/                        # Downloaded videos
├── data/
│   ├── features/                  # Extracted features
│   └── training/                  # Training datasets
├── logs/                          # Agent logs
├── requirements.txt
├── .env.example
└── README.md
```

---

## Troubleshooting

### Issue: Tesseract not found

**Solution**: Install Tesseract OCR and set path in `.env`:
```
TESSERACT_PATH=/usr/bin/tesseract
```

### Issue: YOLO model not found

**Solution**: Train or download YOLO model for arrow detection. The agent will work without it.

### Issue: Model not found

**Solution**: The agent will use a dummy model for testing. Train a real model for production use.

### Issue: Video download fails

**Solution**: 
- Check internet connection
- Verify YouTube URL is correct
- Some videos may be restricted

---

## Performance

- **Video Processing**: ~2-5x realtime (depends on hardware)
- **Frame Step**: Processing every 5th frame (configurable)
- **Model Inference**: ~10-20ms per sequence (GPU)
- **Memory**: ~2-4GB during processing

---

## Future Enhancements

- [ ] Multi-GPU support for faster processing
- [ ] Real-time streaming mode (process live streams)
- [ ] Advanced gesture recognition
- [ ] Audio analysis (voice commands)
- [ ] Multi-timeframe analysis
- [ ] Ensemble models
- [ ] A/B testing framework

---

## License

Proprietary - Part of SMC Alpha Dashboard

---

## Support

For issues or questions, contact the development team or check the project documentation.
