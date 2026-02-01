
# ETL Configuration
class Config:
    OLLAMA_BASE_URL = "http://localhost:11434"
    OLLAMA_MODEL = "llama3"
    UPLOAD_FOLDER = "uploads"
    OUTPUT_FOLDER = "outputs"
    ALLOWED_EXTENSIONS = {'pdf', 'csv', 'txt'}
