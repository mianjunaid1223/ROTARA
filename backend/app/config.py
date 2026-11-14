from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parents[1] / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "ROTARA API"
    app_version: str = "0.2.0"
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    cache_ttl_hours: int = 24
    empty_optical_cache_hours: int = 6
    cache_dir: Path = Path(__file__).resolve().parent / "cache" / "data"

    nasa_power_base_url: str = "https://power.larc.nasa.gov/api/temporal/daily/point"
    pc_stac_url: str = "https://planetarycomputer.microsoft.com/api/stac/v1"
    pc_sas_url: str = "https://planetarycomputer.microsoft.com/api/sas/v1/token"

    # Approximate geographic envelope for Punjab, Pakistan (with small border margin)
    punjab_min_lat: float = 27.5
    punjab_max_lat: float = 34.2
    punjab_min_lon: float = 69.2
    punjab_max_lon: float = 75.6


settings = Settings()
settings.cache_dir.mkdir(parents=True, exist_ok=True)
