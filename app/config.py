import os

from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./vcbrain.db")
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]

MODEL_MAIN = "gpt-4o"          # axis scoring / memos / cold-start footprint
MODEL_MINI = "gpt-4o-mini"     # extraction / filter / trust / outreach / search parsing
TEMPERATURE = 0.2
AUDIO_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "audio")
