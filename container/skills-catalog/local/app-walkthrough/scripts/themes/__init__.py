from .saas import SAAS
from .cinematic import CINEMATIC
from .dev import DEV

THEMES = {
    "saas": SAAS,
    "cinematic": CINEMATIC,
    "dev": DEV,
}


def get_theme(name: str):
    theme = THEMES.get(name)
    if theme is None:
        raise ValueError(f"Unknown theme '{name}'. Available: {list(THEMES.keys())}")
    return theme
