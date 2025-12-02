import { spawn } from 'child_process';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PythonServiceManager {
    constructor() {
        this.process = null;
        this.serviceUrl = process.env.SENTIMENT_SERVICE_URL || 'http://localhost:8000';
        this.pythonPath = process.env.PYTHON_PATH || 'python';
        this.servicePath = path.join(__dirname, '..', 'sentiment-service', 'main.py');
        this.maxRestarts = 3;
        this.restartCount = 0;
        this.isStarting = false;
    }

    async start() {
        if (this.isStarting) {
            console.log('⏳ Python service is already starting...');
            return this.waitForHealthy();
        }

        console.log('🐍 Starting Python sentiment service...');
        this.isStarting = true;

        // Check if already running
        if (await this.isHealthy()) {
            console.log('✅ Python service already running');
            this.isStarting = false;
            return true;
        }

        return new Promise((resolve, reject) => {
            const serviceDir = path.dirname(this.servicePath);

            // Spawn Python process
            this.process = spawn(this.pythonPath, [this.servicePath], {
                cwd: serviceDir,
                env: {
                    ...process.env,
                    PORT: '8000',
                    BERT_MODEL_PATH: process.env.BERT_MODEL_PATH || path.join(__dirname, '..', '..', 'bert-keras-bert_large_en-v3')
                },
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let startupComplete = false;

            // Handle stdout
            this.process.stdout.on('data', (data) => {
                const output = data.toString().trim();
                console.log(`[Python Service] ${output}`);

                // Check if service started successfully
                if (output.includes('Uvicorn running') || output.includes('Application startup complete')) {
                    if (!startupComplete) {
                        startupComplete = true;
                        this.isStarting = false;
                        console.log('✅ Python sentiment service started successfully');
                        resolve(true);
                    }
                }
            });

            // Handle stderr
            this.process.stderr.on('data', (data) => {
                const error = data.toString().trim();
                // Only log non-TensorFlow warnings
                if (!error.includes('TensorFlow') && !error.includes('oneDNN')) {
                    console.error(`[Python Service Error] ${error}`);
                }
            });

            // Handle process exit
            this.process.on('exit', (code, signal) => {
                console.log(`Python service exited with code ${code}, signal ${signal}`);
                this.process = null;
                this.isStarting = false;

                if (code !== 0 && code !== null && this.restartCount < this.maxRestarts) {
                    this.restartCount++;
                    console.log(`⚠️ Attempting restart ${this.restartCount}/${this.maxRestarts}...`);
                    setTimeout(() => this.start(), 5000);
                }
            });

            // Handle process errors
            this.process.on('error', (error) => {
                console.error('❌ Failed to start Python service:', error.message);
                this.isStarting = false;
                reject(error);
            });

            // Timeout if service doesn't start (60 seconds for model loading)
            setTimeout(async () => {
                if (await this.isHealthy()) {
                    if (!startupComplete) {
                        startupComplete = true;
                        this.isStarting = false;
                        resolve(true);
                    }
                } else if (!startupComplete) {
                    this.isStarting = false;
                    reject(new Error('Python service failed to start within 60 seconds'));
                }
            }, 60000);
        });
    }

    async isHealthy() {
        try {
            const response = await axios.get(`${this.serviceUrl}/health`, {
                timeout: 5000,
                validateStatus: () => true
            });
            return response.data?.status === 'healthy' && response.data?.model_loaded === true;
        } catch (error) {
            return false;
        }
    }

    async waitForHealthy(maxWait = 60000) {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWait) {
            if (await this.isHealthy()) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return false;
    }

    stop() {
        if (this.process) {
            console.log('🛑 Stopping Python sentiment service...');
            this.process.kill('SIGTERM');
            this.process = null;
        }
    }

    async getStatus() {
        const healthy = await this.isHealthy();
        return {
            running: this.process !== null,
            healthy,
            pid: this.process?.pid || null,
            restartCount: this.restartCount
        };
    }
}

export const pythonServiceManager = new PythonServiceManager();
