@echo off
REM Startup script for Python sentiment service (Windows)

REM Set default port if not set
if "%PORT%"=="" set PORT=8000

REM Set model path if not set (relative to this script's directory)
if "%BERT_MODEL_PATH%"=="" (
    set SCRIPT_DIR=%~dp0
    set BERT_MODEL_PATH=%SCRIPT_DIR%..\..\bert-keras-bert_large_en-v3
)

echo Starting Sentiment Analysis Service...
echo Port: %PORT%
echo Model Path: %BERT_MODEL_PATH%

REM Start the service
python main.py

