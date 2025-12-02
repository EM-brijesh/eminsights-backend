import os
import sys

print(f"Python executable: {sys.executable}")
print(f"CWD: {os.getcwd()}")

try:
    import keras
    print(f"keras version: {keras.__version__}")
except ImportError as e:
    print(f"Failed to import keras: {e}")

try:
    import keras_hub
    print(f"keras_hub version: {keras_hub.__version__}")
except ImportError as e:
    print(f"Failed to import keras_hub: {e}")

try:
    import tensorflow
    print(f"tensorflow version: {tensorflow.__version__}")
except ImportError as e:
    print(f"Failed to import tensorflow: {e}")
