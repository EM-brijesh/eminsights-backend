#!/bin/bash
# Startup script for Python sentiment service

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Set default port if not set
export PORT=${PORT:-8000}

# Set model path if not set (relative to this script's directory)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
export BERT_MODEL_PATH=${BERT_MODEL_PATH:-"$SCRIPT_DIR/../bert-keras-bert_large_en-v3"}

echo "Starting Sentiment Analysis Service..."
echo "Port: $PORT"
echo "Model Path: $BERT_MODEL_PATH"

# Start the service
python main.py

