import os
import json
import requests
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field
from openai import OpenAI
from geopy.geocoders import Nominatim
from geopy.extra.rate_limiter import RateLimiter

class ExtractedIncident(BaseModel):
    title: str = Field(description="Krátký výstižný název incidentu")
    incident_type: str = Field(description="Typ: loupež, napadení, krádež, výtržnictví, obtěžování apod.")
    severity: int = Field(description="Závažnost na stupnici 1-10 (1=drobná krádež, 10=závažné násilí)")
    location_name: str = Field(description="Přesná lokalita, ulice, křižovatka, park nebo náměstí v Praze")
    time_of_day: str = Field(description="Čas incidentu, např. 'noc', 'den', 'podvečer' nebo konkrétní hodina")
    summary: str = Field(description="Shrnutí incidentu do 2 vět")

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))
geolocator = Nominatim(user_agent="safepath_incident_parser")
geocode = RateLimiter(geolocator.geocode, min_delay_seconds=1.0)

def extract_incident_from_text(article_text: str) -> ExtractedIncident | None:
    try:
        response = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "Jsi analytik bezpečnostních incidentů v Praze. Z textu tiskové zprávy přesně extrahuj typ incidentu, závažnost a konkrétní lokalitu v Praze."
                },
                {"role": "user", "content": article_text}
            ],
            response_format=ExtractedIncident,
        )
        return response.choices[0].message.parsed
    except Exception as e:
        print(f"Chyba při parsování LLM: {e}")
        return None

def get_coordinates_for_location(location_name: str) -> tuple[float, float] | None:
    query = f"{location_name}, Praha, Česká republika"
    try:
        location = geocode(query)
        if location:
            return location.latitude, location.longitude
    except Exception as e:
        print(f"Chyba geokódování pro '{location_name}': {e}")
    return None

def process_article(article_url: str) -> dict | None:
    headers = {"User-Agent": "Mozilla/5.0"}
    response = requests.get(article_url, headers=headers)
    if response.status_code != 200:
        return None

    soup = BeautifulSoup(response.text, "html.parser")
    paragraphs = [p.get_text() for p in soup.find_all("p")]
    full_text = "\n".join(paragraphs)

    incident_data = extract_incident_from_text(full_text[:4000])
    if not incident_data:
        return None

    coords = get_coordinates_for_location(incident_data.location_name)
    return {
        **incident_data.model_dump(),
        "coordinates": coords,
        "source_url": article_url
    }
