import { getApiKey } from './apiKeyService';

export async function getRoute(start: [number, number], end: [number, number], mode: 'driving-car' | 'cycling-regular' | 'foot-walking') {
    const apiKey = await getApiKey('openrouteservice');
    if (!apiKey) return null;

    // OpenRouteService API call
    // POST https://api.openrouteservice.org/v2/directions/{profile}/geojson
    try {
        const response = await fetch(`https://api.openrouteservice.org/v2/directions/${mode}/geojson`, {
            method: 'POST',
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                coordinates: [start, end] // [lon, lat]
            })
        });

        if (!response.ok) {
            console.error('ORS Error:', await response.text());
            return null;
        }

        const data = await response.json();
        const feature = data.features[0];
        return {
            distance: feature.properties.summary.distance, // meters
            duration: feature.properties.summary.duration, // seconds
            geometry: feature.geometry
        };
    } catch (e) {
        console.error('ORS Exception:', e);
        return null;
    }
}

// Placeholder for Navitia
export async function getPublicTransportRoute(start: [number, number], end: [number, number]) {
    const apiKey = await getApiKey('navitia');
    if (!apiKey) return null;
    // Implementation for Navitia would go here
    return null;
}
