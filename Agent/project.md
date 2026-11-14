ROTARA: Earth-Informed Crop Rotation Intelligence

Build ROTARA, a functional agricultural decision-support platform for the 2026 NASA Space Apps Challenge.

Challenge: Field Shift: Adapting Farms with NASA Data

Official challenge: https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data/

1. Project objective

ROTARA helps farmers in Punjab, Pakistan explore crop-rotation strategies using NASA Earth observations, local agricultural information, and explainable scientific analysis.

The platform should help farmers understand:

Changing rainfall and temperature conditions.
Soil moisture and water availability.
Vegetation health and seasonal crop stress.
Potential soil-health concerns.
Crop suitability under local environmental conditions.
Alternative crop rotations that may improve long-term resilience.

The application must be useful to ordinary farmers and provide a separate advanced interface for agronomists.

Build a working MVP with real data integrations and functional analysis. Avoid unnecessary enterprise features.

2. Core product requirements
Farmer-friendly design

Farmer usability is the highest design priority.

The default experience must be simple enough for someone with limited technical knowledge.

Use:

Clear, everyday English.
Large readable text and touch-friendly controls.
Simple navigation.
Familiar agricultural terminology.
Visual indicators instead of complicated scientific charts.
Short explanations of environmental conditions.
Clear instructions for field registration.
Helpful messages when data is unavailable.

For example:

Technical presentation: "Soil moisture anomaly: -1.8 standard deviations."

Farmer presentation: "Your field may be drier than usual. Consider reviewing your irrigation requirements."

Avoid showing complex scientific measurements in Farmer Mode.

Every recommendation should explain why it was suggested and what the farmer could consider doing next.

Two application modes

Farmer Mode is the default.

It should provide:

Field information.
Environmental condition summaries.
Simple soil and vegetation indicators.
Crop-rotation recommendations.
Rotation comparisons.
Practical explanations.

Agronomist Mode should provide:

Scientific measurements.
Satellite dataset information.
Historical charts.
NDVI and soil moisture analysis.
Detailed scoring breakdowns.
Model assumptions.
Data quality and uncertainty.
Spatial layers and legends.

Both modes must use the same scientific calculations.

3. Application structure

There must be no marketing landing page, login page, registration page, or introductory splash screen.

Open the application directly into its main interface.

The first screen must be an interactive map.

Main navigation:

Farm Map
My Fields
Field Analysis
Crop Rotations
Soil Health
Climate Simulator
Settings

Make the interface responsive for desktop and mobile.

4. Field registration and mapping

Use MapLibre GL JS.

Support three ways to register a field:

GPS location detection.
Drawing field boundaries directly on the map.
Manual latitude and longitude entry.

Allow farmers to:

Name their fields.
Draw and edit field boundaries.
Enter field size.
Select their current crop.
Specify planting and harvesting dates.
Enter available soil information.
Record irrigation type and water availability.
Save multiple fields.

Use GeoJSON for field boundaries.

Calculate field area and display it in acres and hectares.

Map layers

Provide a hybrid map experience with:

Satellite imagery.
Standard geographic maps.
Topographic information where available.
Environmental overlays.

Display color-coded overlays for:

Soil moisture.
Rainfall.
Temperature.
NDVI.
Vegetation stress.
Terrain.

Farmer Mode should have simple layer controls and clear legends.

Agronomist Mode should provide opacity controls, historical date filters, dataset details, and advanced GIS options.

Clearly communicate the actual resolution of each dataset. Do not imply that coarse-resolution satellite products provide precise field-level measurements.

5. NASA and supporting data sources

Real Earth observation data is mandatory for environmental analysis.

Use the datasets listed in the official challenge resources as the primary reference for data integration.

Prioritize sources with suitable coverage of Punjab, Pakistan.

NASA datasets

SMAP (Soil Moisture Active Passive)

Use for:

Surface soil moisture.
Soil moisture changes.
Drought-related indicators.
Freeze/thaw information where relevant.

SMAP observations have approximately 2-3 day revisit intervals, depending on the product.

GPM / IMERG

Use for:

Rainfall accumulation.
Precipitation patterns.
Rainfall variability.
Extreme precipitation.
Historical rainfall comparisons.

Landsat

Use for:

Surface reflectance.
NDVI.
Vegetation changes.
Bare-ground periods.
Seasonal crop monitoring.

Use appropriate Landsat products with approximately 30-meter spatial resolution.

MODIS / VIIRS

Use for:

Vegetation indices.
Seasonal vegetation patterns.
Regional vegetation monitoring.
Historical vegetation changes.

Account for their coarser spatial resolutions.

NASA POWER

Use for:

Temperature.
Solar radiation.
Meteorological variables.
Historical climate conditions.
Agricultural climate analysis.

ECOSTRESS

Use for:

Land-surface temperature.
Evapotranspiration.
Vegetation water stress indicators.
Heat-related environmental conditions.

SRTM

Use for:

Elevation.
Slope.
Terrain analysis.
Potential runoff and erosion susceptibility.

GLDAS / NLDAS

Prioritize GLDAS for global coverage.

Use appropriate products for:

Soil moisture.
Temperature.
Precipitation.
Evapotranspiration-related variables.
Historical environmental time series.

NLDAS is primarily a North American dataset. Do not use it as a Punjab data source.

GEDI

Use where suitable for:

Vegetation structure.
Above-ground biomass.
Surrounding land-cover context.

Do not force GEDI into field-level crop analysis where its sampling or coverage is unsuitable.

Additional international resources

ESA Copernicus Sentinel-2

Use for:

10-20 meter multispectral imagery.
NDVI and other vegetation indices.
Bare-soil detection.
Crop monitoring.
Vegetation stress analysis.

Sentinel-2 is especially useful for field-scale monitoring when appropriate imagery is available.

ERA5

Use for:

Historical temperature.
Rainfall.
Humidity.
Wind.
Radiation.
Other climate variables.

It can provide continuous climate context where local weather observations are limited.

FAO Global Agro-Ecological Zones (GAEZ)

Use for:

Crop suitability.
Agro-climatic conditions.
Soil constraints.
Water availability.
Crop suitability comparisons.
USDA resources

The NASA challenge also lists USDA resources:

Ag Data Commons.
Web Soil Survey.
Cropland Data Layer / CropScape.
PRISM.
SSURGO / STATSGO2.
NAIP.
NLCD.
USDA NASS QuickStats.
USDA AMS Market News.
USGS NWIS.
CoCoRaHS.
OpenET.
LANDFIRE.

These are primarily designed for the United States or have geographically restricted coverage.

Do not assume they cover Punjab, Pakistan.

Use them only where their geographic coverage and intended application support the requested analysis. Do not substitute US soil maps or US crop classifications for Pakistani agricultural information.

Data integration rules

Before implementing a dataset:

Verify its geographic coverage.
Verify the API and documentation.
Check access requirements.
Check spatial and temporal resolution.
Confirm that the product is appropriate for the intended calculation.

Use official APIs and documented data services.

Prioritize NASA Earthdata, NASA POWER, NASA GES DISC, NASA AppEEARS, NASA LP DAAC, and other official services where appropriate.

Never invent API endpoints or observations.

If a dataset is unavailable for a location, display its unavailable status and continue only with indicators supported by the remaining data.

Clearly distinguish NASA observations, partner-agency observations, derived indicators, and modeled estimates.

6. Punjab agricultural knowledge

Build the crop database around Punjab, Pakistan.

Include relevant crops such as:

Wheat.
Rice.
Cotton.
Sugarcane.
Maize.
Chickpea.
Mung bean.
Lentils.
Other locally suitable legumes and cover crops.

For each crop, maintain:

Growing season.
Planting and harvesting periods.
Temperature requirements.
Water requirements.
Root characteristics.
Nutrient requirements.
Nitrogen-fixing potential.
Drought and heat tolerance.
Organic matter contribution.
Rotation compatibility.
Pest and disease considerations.
Market suitability where reliable data exists.

Use credible agricultural sources.

Investigate Pakistan and Punjab agricultural resources, including relevant provincial agriculture departments, Pakistan Meteorological Department resources, FAO publications, and suitable soil research datasets.

Allow farmers to enter available soil laboratory results:

Soil pH.
Organic matter.
Nitrogen.
Phosphorus.
Potassium.
Soil texture.
Salinity.
Electrical conductivity.

These inputs should be optional.

Never infer exact soil nutrient concentrations from satellite observations.

7. Environmental analysis

Build the analytical engine in Python.

Calculate or retrieve appropriate indicators for:

Water conditions
Soil moisture.
Rainfall accumulation.
Rainfall variability.
Soil moisture anomalies.
Drought-related indicators.
Evapotranspiration.
Climate conditions
Average temperature.
Maximum temperature.
Heat stress.
Seasonal temperature patterns.
Historical climate trends.
Growing-season suitability.
Vegetation
NDVI.
Vegetation condition.
Seasonal vegetation changes.
Vegetation stress indicators.
Bare-field periods.
Terrain
Elevation.
Slope.
Potential runoff susceptibility.
Potential erosion risk.

Explain scientific limitations.

For example:

NDVI measures vegetation greenness, not soil fertility.
SMAP does not provide a direct measurement of every field's root-zone moisture.
Land-surface temperature differs from air temperature.
Slope indicates terrain-related erosion susceptibility, not actual measured erosion.

Do not turn indirect indicators into definitive soil-health measurements.

8. Crop-rotation recommendation engine

This is the main intelligence feature.

Build a deterministic, explainable recommendation engine.

Use:

Agronomic rules.
Crop compatibility.
Growing-season suitability.
Water requirements.
Temperature tolerance.
Historical environmental conditions.
Farmer priorities.
Weighted scoring.
Statistical analysis.

No external LLM API is required.

The engine must compare at least three strategies.

Strategy A: Existing rotation

Use the farmer's current rotation as the baseline.

Strategy B: Water and climate resilience

Prioritize drought tolerance, water conservation, seasonal suitability, and reduced climate stress.

Strategy C: Soil improvement

Prioritize nitrogen-fixing crops, crop diversity, root diversity, cover crops, organic matter contributions, and soil protection.

For each strategy, show:

Suggested crop sequence.
Planting and harvesting periods.
Overall suitability score.
Individual scoring criteria.
Potential benefits.
Risks and limitations.
Supporting environmental observations.
Missing information.
Reasons for the recommendation.

Allow farmers to set priorities such as water conservation, soil improvement, market suitability, and climate resilience.

Changing priorities should update the scoring and ranking.

Clearly distinguish suitability scores from yield predictions and profitability estimates.

Do not promise guaranteed improvements.

9. Soil health analysis

Create a soil-health section using available field information and environmental indicators.

Consider:

Soil moisture conditions.
Vegetation cover.
Bare-field periods.
Potential erosion susceptibility.
Crop diversity.
Nitrogen-fixing crop inclusion.
Organic matter management potential.
Crop rotation history.

Separate measured soil properties from satellite-derived indicators and modeled estimates.

If laboratory soil information is missing, explain which conclusions cannot be reached.

10. Climate scenario simulator

Create an interactive simulator where farmers can adjust hypothetical:

Rainfall changes.
Temperature increases.
Water availability.

Example:

"What happens if rainfall decreases by 15%?"

Recalculate relevant crop suitability indicators and compare rotation strategies.

Show:

Baseline conditions.
Hypothetical conditions.
Changes in crop suitability.
Changes in strategy rankings.
Important assumptions.

Clearly label simulated conditions as hypothetical. Do not present them as actual NASA observations or guaranteed climate forecasts.

11. Dashboard and visualizations

Create a dashboard for each registered field.

Farmer Mode should show:

Overall field overview.
Water conditions.
Rainfall.
Temperature.
Vegetation condition.
Important environmental risks.
Recommended rotation strategies.
Suggested next steps.

Use clear charts and simple visual indicators.

Agronomist Mode should provide detailed measurements, historical charts, observation dates, source information, spatial resolution, data quality, and model assumptions.

Include:

Rainfall history.
Temperature trends.
Soil moisture trends.
NDVI time series.
Rotation comparisons.
Climate scenario comparisons.

Every chart must have clear labels and units.

12. Technology stack

Frontend:

Next.js.
TypeScript.
Tailwind CSS.
MapLibre GL JS.
Recharts.

Backend:

Python.
FastAPI.
NumPy.
Pandas.
GeoPandas.
Rasterio.
Xarray.
Shapely.

Storage:

IndexedDB for local field data and saved analyses.
PostgreSQL with PostGIS where server-side geospatial processing is required.

No authentication system is needed.

Allow farmers to export and import their field data.

Keep API credentials on the server.

Separate data retrieval, scientific processing, crop knowledge, recommendation scoring, and UI components into maintainable modules.

13. Visual design

Create a polished agricultural intelligence interface with:

Natural green tones.
Neutral backgrounds.
Readable typography.
Clear icons.
Strong map visibility.
Accessible color contrast.
Responsive layouts.

Avoid crowded dashboards, excessive gradients, tiny labels, decorative statistics, and complicated controls in Farmer Mode.

The map and actual environmental findings should receive the most visual attention.

Prioritize smartphone usability.

14. Development order

Build in this order:

Phase 1: Core application

Next.js and FastAPI setup.
Main map-first interface.
Farmer and Agronomist modes.
Field drawing and GPS.
IndexedDB persistence.

Phase 2: Real data

Integrate SMAP, GPM/IMERG, NASA POWER, and suitable vegetation datasets.
Add Sentinel-2 where useful.
Validate observations.
Build environmental indicators.
Handle unavailable data.

Phase 3: Agricultural intelligence

Build the Punjab crop database.
Implement rotation rules.
Generate three rotation strategies.
Add transparent scoring and explanations.

Phase 4: Advanced features

Soil-health analysis.
Climate simulator.
Historical charts.
Environmental map overlays.
Agronomist controls.

Phase 5: Testing

Test field registration.
Test actual data retrieval.
Test missing-data scenarios.
Test calculations.
Test rotation comparisons.
Test mobile usability.
Verify local persistence.
15. Hackathon demonstration

The finished MVP must support this complete workflow:

Open ROTARA directly into the map.
Locate an agricultural field in Punjab.
Draw its boundaries.
Enter its current crop and basic information.
Retrieve available NASA observations.
Display environmental conditions.
Explain water, rainfall, temperature, and vegetation findings.
Generate three crop-rotation strategies.
Compare their suitability and supporting evidence.
Change farmer priorities and recalculate recommendations.
Adjust rainfall or temperature in the climate simulator.
Compare the effects on rotation strategies.
Switch to Agronomist Mode and inspect scientific details.

Use real data in the demonstration wherever available.

Never replace missing observations with fabricated NASA measurements.

16. Acceptance criteria

The MVP must:

Open directly into the main platform.
Require no account or login.
Support field registration through GPS, drawing, and manual coordinates.
Save field information locally.
Retrieve real environmental observations for supported Punjab locations.
Display source and observation dates.
Generate at least three explainable crop-rotation strategies.
Include the existing rotation as a baseline.
Support farmer-defined priorities.
Provide a working climate scenario simulator.
Provide Farmer Mode and Agronomist Mode.
Clearly identify missing data and uncertainty.
Work on desktop and mobile.
17. Instructions to the coding agent

Start by inspecting the project directory and setting up the application.

Verify NASA API documentation and dataset coverage before integrating data sources.

Build the core workflow early. Do not spend the entire development process producing plans or documentation.

Do not leave essential features as nonfunctional buttons or static mockups.

Test each major feature as it is implemented.

If external credentials are required, document the setup and provide clear instructions.

Keep the application focused on a complete farmer workflow.

The final deliverable must be a working agricultural decision-support application that demonstrates how NASA Earth observations can help farmers in Punjab explore crop rotations suited to changing environmental conditions.