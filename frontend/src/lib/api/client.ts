import type {
  ClimateScenarioInput,
  ClimateSimulationResponse,
  CropInfo,
  EnvironmentalAnalysisResponse,
  FarmerPriorities,
  FieldProfile,
  RotationResponse,
  SoilHealthResponse,
} from "@/types/rotara";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  if (!resp.ok) {
    let detail = `Request failed (${resp.status})`;
    try {
      const err = await resp.json();
      if (err?.detail) detail = String(err.detail);
    } catch {
      // ignore non-json body
    }
    throw new Error(detail);
  }
  return (await resp.json()) as T;
}

export async function checkBackendHealth(): Promise<{ status: string; version: string }> {
  return apiFetch("/health");
}

export async function fetchCropCalendar(refDate?: string): Promise<{
  reference_date: string;
  current_season: string;
  upcoming_season: string;
  crops: CropInfo[];
}> {
  const qs = refDate ? `?ref_date=${encodeURIComponent(refDate)}` : "";
  return apiFetch(`/api/crops/calendar${qs}`);
}

export async function analyzeFieldEnvironment(
  field: FieldProfile,
  refDate?: string
): Promise<EnvironmentalAnalysisResponse> {
  const qs = refDate ? `?ref_date=${encodeURIComponent(refDate)}` : "";
  return apiFetch(`/api/analysis/environment${qs}`, {
    method: "POST",
    body: JSON.stringify(field),
  });
}

export async function fetchRotationRecommendations(params: {
  field: FieldProfile;
  priorities: FarmerPriorities;
  reference_date?: string;
  analysis?: EnvironmentalAnalysisResponse;
}): Promise<RotationResponse> {
  return apiFetch("/api/rotations/recommend", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function evaluateSoilHealthApi(
  field: FieldProfile,
  analysis?: EnvironmentalAnalysisResponse
): Promise<SoilHealthResponse> {
  return apiFetch("/api/soil/health", {
    method: "POST",
    body: JSON.stringify({ field, analysis: analysis ?? null }),
  });
}

export async function simulateClimateScenario(params: {
  field: FieldProfile;
  priorities: FarmerPriorities;
  scenario: ClimateScenarioInput;
  reference_date?: string;
  analysis?: EnvironmentalAnalysisResponse;
}): Promise<ClimateSimulationResponse> {
  return apiFetch("/api/climate/simulate", {
    method: "POST",
    body: JSON.stringify(params),
  });
}
