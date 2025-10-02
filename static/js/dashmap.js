// HazardWatch Dashboard JavaScript
// Global variables
let climateData = [];
let shapefileData = [];
let mergedData = [];
let map;
let currentMetric = "temperature";
let trendChart;
let barChart;

// Initialize dashboard
document.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  initializeMap();
  initializeCharts();
  setupEventListeners();
  updateDashboard();
});

// Load and merge data
async function loadData() {
  try {
    // Load climate data
    const climateResponse = await fetch("static/data/climate.json");
    climateData = await climateResponse.json();

    // Load shapefile data
    const shapeResponse = await fetch("static/data/shapefile.geojson");
    shapefileData = await shapeResponse.json();

    // Normalize and merge data
    mergedData = mergeDatasets();

    // Populate filters
    populateFilters();

    console.log("Data loaded successfully");
  } catch (error) {
    console.error("Error loading data:", error);
  }
}

// Normalize string for comparison
function normalizeString(str) {
  return str.toString().toLowerCase().trim();
}

// Merge climate and shapefile data
function mergeDatasets() {
  const merged = [];

  climateData.forEach((climate) => {
    const district = normalizeString(climate.District);
    const sector = normalizeString(climate.Sector);

    // Find matching geometry
    const geometry = shapefileData.features.find((feature) => {
      const geoDistrict = normalizeString(feature.properties.district);
      const geoSector = normalizeString(feature.properties.sector);
      return geoDistrict === district && geoSector === sector;
    });

    merged.push({
      province: climate.Province,
      district: climate.District,
      sector: climate.Sector,
      year: climate.Year,
      month: climate.Month,
      rainfall: parseFloat(climate.Rainfall) || 0,
      soilMoisture: parseFloat(climate["Soil Moisture"]) || 0,
      tmax: parseFloat(climate.Tmax) || 0,
      tmin: parseFloat(climate.Tmin) || 0,
      tmean: parseFloat(climate.Tmean) || 0,
      geometry: geometry ? geometry.geometry : null,
      sectorId: geometry ? geometry.properties.sector_id : null,
    });
  });

  return merged;
}

// Calculate risk level
function calculateRisk(data) {
  let riskScore = 0;

  // Temperature risk (extreme temps)
  if (data.tmean > 30 || data.tmean < 15) riskScore += 3;
  else if (data.tmean > 28 || data.tmean < 17) riskScore += 2;
  else riskScore += 1;

  // Rainfall risk (extremes)
  if (data.rainfall > 200 || data.rainfall < 50) riskScore += 3;
  else if (data.rainfall > 150 || data.rainfall < 70) riskScore += 2;
  else riskScore += 1;

  // Soil moisture risk
  if (data.soilMoisture < 20 || data.soilMoisture > 80) riskScore += 3;
  else if (data.soilMoisture < 30 || data.soilMoisture > 70) riskScore += 2;
  else riskScore += 1;

  if (riskScore >= 7) return "high-risk";
  if (riskScore >= 5) return "medium-risk";
  return "low-risk";
}

// Identify potential disasters
function identifyDisasters(data) {
  const disasters = [];

  if (data.rainfall > 200) disasters.push("Flooding");
  if (data.rainfall < 50) disasters.push("Drought");
  if (data.tmean > 30) disasters.push("Heat Wave");
  if (data.soilMoisture < 20) disasters.push("Soil Degradation");
  if (data.soilMoisture > 80 && data.rainfall > 150)
    disasters.push("Landslides");

  return disasters.length > 0 ? disasters.join(", ") : "Low Risk";
}

// Update KPIs
function updateKPIs() {
  const districts = [...new Set(mergedData.map((d) => d.district))];
  const sectors = [...new Set(mergedData.map((d) => d.sector))];

  const avgTemp =
    mergedData.reduce((sum, d) => sum + d.tmean, 0) / mergedData.length;
  const avgRainfall =
    mergedData.reduce((sum, d) => sum + d.rainfall, 0) / mergedData.length;
  const avgSoil =
    mergedData.reduce((sum, d) => sum + d.soilMoisture, 0) / mergedData.length;

  document.getElementById("kpi-districts").textContent = districts.length;
  document.getElementById("kpi-sectors").textContent = sectors.length;
  document.getElementById("kpi-temperature").textContent =
    avgTemp.toFixed(1) + "°C";
  document.getElementById("kpi-rainfall").textContent =
    avgRainfall.toFixed(0) + "mm";
  document.getElementById("kpi-soil").textContent = avgSoil.toFixed(1) + "%";
}

// Update top 10 sectors at risk
function updateTopSectors() {
  const sectorRisks = {};

  mergedData.forEach((data) => {
    const key = `${data.district} - ${data.sector}`;
    if (!sectorRisks[key]) {
      sectorRisks[key] = {
        district: data.district,
        sector: data.sector,
        totalRisk: 0,
        count: 0,
        data: data,
      };
    }

    const riskLevel = calculateRisk(data);
    const riskValue =
      riskLevel === "high-risk" ? 3 : riskLevel === "medium-risk" ? 2 : 1;
    sectorRisks[key].totalRisk += riskValue;
    sectorRisks[key].count++;
  });

  const sortedSectors = Object.values(sectorRisks)
    .map((s) => ({
      ...s,
      avgRisk: s.totalRisk / s.count,
    }))
    .sort((a, b) => b.avgRisk - a.avgRisk)
    .slice(0, 10);

  const grid = document.getElementById("top-sectors-grid");
  grid.innerHTML = sortedSectors
    .map((s, i) => {
      const riskClass =
        s.avgRisk >= 2.5
          ? "high-risk"
          : s.avgRisk >= 1.5
          ? "medium-risk"
          : "low-risk";
      const riskLabel = riskClass.replace("-risk", "").toUpperCase();

      return `
            <div class="sector-card ${riskClass}">
                <div class="risk-badge">${riskLabel}</div>
                <h4>${i + 1}. ${s.sector}</h4>
                <p><strong>${s.district}</strong></p>
                <p>Avg Temp: ${s.data.tmean.toFixed(1)}°C</p>
                <p>Rainfall: ${s.data.rainfall.toFixed(0)}mm</p>
                <p>Soil: ${s.data.soilMoisture.toFixed(1)}%</p>
            </div>
        `;
    })
    .join("");
}

// Initialize map
function initializeMap() {
  map = L.map("map").setView([-1.9403, 29.8739], 9);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);

  updateMapLayers();
}

// Update map layers based on current metric
function updateMapLayers() {
  // Clear existing layers except base map
  map.eachLayer((layer) => {
    if (layer instanceof L.GeoJSON || layer instanceof L.Marker) {
      map.removeLayer(layer);
    }
  });

  const filteredData = getFilteredData();

  filteredData.forEach((data) => {
    if (data.geometry) {
      const riskLevel = calculateRisk(data);
      const color =
        riskLevel === "high-risk"
          ? "#f5576c"
          : riskLevel === "medium-risk"
          ? "#ffa726"
          : "#66bb6a";

      L.geoJSON(data.geometry, {
        style: {
          fillColor: color,
          weight: 2,
          opacity: 1,
          color: "white",
          fillOpacity: 0.6,
        },
      })
        .bindPopup(
          `
                <strong>${data.sector}, ${data.district}</strong><br>
                Temperature: ${data.tmean.toFixed(1)}°C<br>
                Rainfall: ${data.rainfall.toFixed(0)}mm<br>
                Soil Moisture: ${data.soilMoisture.toFixed(1)}%<br>
                <strong>Risk: ${riskLevel
                  .replace("-", " ")
                  .toUpperCase()}</strong>
            `
        )
        .addTo(map);
    }
  });
}

// Initialize charts
function initializeCharts() {
  const trendCtx = document.getElementById("trend-chart").getContext("2d");
  const barCtx = document.getElementById("bar-chart").getContext("2d");

  trendChart = new Chart(trendCtx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Temperature (°C)",
          data: [],
          borderColor: "#667eea",
          backgroundColor: "rgba(102, 126, 234, 0.1)",
          tension: 0.4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
        },
      },
      scales: {
        y: {
          beginAtZero: false,
        },
      },
    },
  });

  barChart = new Chart(barCtx, {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        {
          label: "Risk Score",
          data: [],
          backgroundColor: [
            "#f5576c",
            "#f5576c",
            "#f5576c",
            "#ffa726",
            "#ffa726",
            "#ffa726",
            "#66bb6a",
            "#66bb6a",
            "#66bb6a",
            "#66bb6a",
          ],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 3,
        },
      },
    },
  });

  updateCharts();
}

// Update charts
function updateCharts() {
  const filteredData = getFilteredData();

  // Trend chart
  const trendData = filteredData.reduce((acc, d) => {
    const key = `${d.year}-${d.month}`;
    if (!acc[key]) {
      acc[key] = { temp: 0, rain: 0, soil: 0, count: 0 };
    }
    acc[key].temp += d.tmean;
    acc[key].rain += d.rainfall;
    acc[key].soil += d.soilMoisture;
    acc[key].count++;
    return acc;
  }, {});

  const sortedKeys = Object.keys(trendData).sort();
  const trendValues = sortedKeys.map((key) => {
    const avg = trendData[key];
    if (currentMetric === "temperature") return avg.temp / avg.count;
    if (currentMetric === "rainfall") return avg.rain / avg.count;
    return avg.soil / avg.count;
  });

  const metricLabels = {
    temperature: "Temperature (°C)",
    rainfall: "Rainfall (mm)",
    soil: "Soil Moisture (%)",
  };

  trendChart.data.labels = sortedKeys;
  trendChart.data.datasets[0].label = metricLabels[currentMetric];
  trendChart.data.datasets[0].data = trendValues;
  trendChart.update();

  // Bar chart - Top 10 high-risk sectors
  const sectorRisks = {};
  filteredData.forEach((data) => {
    const key = `${data.sector}`;
    if (!sectorRisks[key]) {
      sectorRisks[key] = { totalRisk: 0, count: 0 };
    }
    const riskLevel = calculateRisk(data);
    const riskValue =
      riskLevel === "high-risk" ? 3 : riskLevel === "medium-risk" ? 2 : 1;
    sectorRisks[key].totalRisk += riskValue;
    sectorRisks[key].count++;
  });

  const topRiskSectors = Object.entries(sectorRisks)
    .map(([sector, risk]) => ({
      sector,
      avgRisk: risk.totalRisk / risk.count,
    }))
    .sort((a, b) => b.avgRisk - a.avgRisk)
    .slice(0, 10);

  barChart.data.labels = topRiskSectors.map((s) => s.sector);
  barChart.data.datasets[0].data = topRiskSectors.map((s) => s.avgRisk);
  barChart.update();
}

// Populate filters
function populateFilters() {
  const provinces = [...new Set(mergedData.map((d) => d.province))];
  const districts = [...new Set(mergedData.map((d) => d.district))];
  const years = [...new Set(mergedData.map((d) => d.year))].sort();
  const months = [...new Set(mergedData.map((d) => d.month))].sort(
    (a, b) => a - b
  );

  const provinceSelect = document.getElementById("filter-province");
  const districtSelect = document.getElementById("filter-district");
  const yearSelect = document.getElementById("filter-year");
  const monthSelect = document.getElementById("filter-month");

  provinces.forEach((p) => {
    const option = document.createElement("option");
    option.value = p;
    option.textContent = p;
    provinceSelect.appendChild(option);
  });

  districts.forEach((d) => {
    const option = document.createElement("option");
    option.value = d;
    option.textContent = d;
    districtSelect.appendChild(option);
  });

  years.forEach((y) => {
    const option = document.createElement("option");
    option.value = y;
    option.textContent = y;
    yearSelect.appendChild(option);
  });

  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  months.forEach((m) => {
    const option = document.createElement("option");
    option.value = m;
    option.textContent = monthNames[m - 1];
    monthSelect.appendChild(option);
  });
}

// Get filtered data
function getFilteredData() {
  const province = document.getElementById("filter-province").value;
  const district = document.getElementById("filter-district").value;
  const year = document.getElementById("filter-year").value;
  const month = document.getElementById("filter-month").value;

  return mergedData.filter((d) => {
    if (province && d.province !== province) return false;
    if (district && d.district !== district) return false;
    if (year && d.year.toString() !== year) return false;
    if (month && d.month.toString() !== month) return false;
    return true;
  });
}

// Update data table
function updateTable() {
  const filteredData = getFilteredData();
  const tableBody = document.getElementById("table-body");

  // Limit to first 100 rows for performance
  const displayData = filteredData.slice(0, 100);

  tableBody.innerHTML = displayData
    .map(
      (data) => `
        <tr>
            <td>${data.district}</td>
            <td>${data.sector}</td>
            <td>${data.tmean.toFixed(1)}</td>
            <td>${data.rainfall.toFixed(0)}</td>
            <td>${data.soilMoisture.toFixed(1)}</td>
            <td>${identifyDisasters(data)}</td>
        </tr>
    `
    )
    .join("");

  if (filteredData.length > 100) {
    tableBody.innerHTML += `
            <tr>
                <td colspan="6" style="text-align: center; color: #666; font-style: italic;">
                    Showing first 100 of ${filteredData.length} records
                </td>
            </tr>
        `;
  }
}

// Generate AI summary
function generateAISummary() {
  const filteredData = getFilteredData();

  // Summary
  const avgTemp =
    filteredData.reduce((sum, d) => sum + d.tmean, 0) / filteredData.length;
  const avgRainfall =
    filteredData.reduce((sum, d) => sum + d.rainfall, 0) / filteredData.length;
  const avgSoil =
    filteredData.reduce((sum, d) => sum + d.soilMoisture, 0) /
    filteredData.length;

  const highRiskCount = filteredData.filter(
    (d) => calculateRisk(d) === "high-risk"
  ).length;
  const riskPercentage = ((highRiskCount / filteredData.length) * 100).toFixed(
    1
  );

  document.getElementById("ai-summary").innerHTML = `
        <p>Analysis of ${
          filteredData.length
        } data points across Rwanda's climate zones reveals:</p>
        <ul>
            <li>Average temperature: ${avgTemp.toFixed(1)}°C</li>
            <li>Average rainfall: ${avgRainfall.toFixed(0)}mm</li>
            <li>Average soil moisture: ${avgSoil.toFixed(1)}%</li>
            <li><strong>${riskPercentage}% of regions are at high risk</strong> for climate-related disasters</li>
            <li>Key concerns: ${
              avgRainfall > 150
                ? "Heavy rainfall and flooding potential"
                : "Drought conditions and water stress"
            }</li>
        </ul>
    `;

  // Key Interventions
  const interventions = [];
  if (avgRainfall < 70) {
    interventions.push("Implement water harvesting and irrigation systems");
    interventions.push("Promote drought-resistant crop varieties");
  }
  if (avgRainfall > 180) {
    interventions.push("Strengthen flood early warning systems");
    interventions.push("Improve drainage infrastructure");
  }
  if (avgTemp > 27) {
    interventions.push("Introduce heat-tolerant agricultural practices");
    interventions.push("Expand tree planting for shade and cooling");
  }
  if (avgSoil < 30) {
    interventions.push("Soil conservation and moisture retention programs");
    interventions.push("Mulching and cover cropping initiatives");
  }

  interventions.push("Climate-smart agriculture training for farmers");
  interventions.push("Establish community-based climate monitoring systems");
  interventions.push(
    "Develop emergency response protocols for extreme weather"
  );

  document.getElementById("ai-interventions").innerHTML = `
        <ul>
            ${interventions.map((i) => `<li>${i}</li>`).join("")}
        </ul>
    `;

  // High-Risk Regions
  const districtRisks = {};
  filteredData.forEach((data) => {
    if (!districtRisks[data.district]) {
      districtRisks[data.district] = { totalRisk: 0, count: 0, data: [] };
    }
    const riskLevel = calculateRisk(data);
    const riskValue =
      riskLevel === "high-risk" ? 3 : riskLevel === "medium-risk" ? 2 : 1;
    districtRisks[data.district].totalRisk += riskValue;
    districtRisks[data.district].count++;
    districtRisks[data.district].data.push(data);
  });

  const topRiskDistricts = Object.entries(districtRisks)
    .map(([district, risk]) => ({
      district,
      avgRisk: risk.totalRisk / risk.count,
      data: risk.data[0],
    }))
    .sort((a, b) => b.avgRisk - a.avgRisk)
    .slice(0, 5);

  document.getElementById("ai-high-risk").innerHTML = `
        <ul>
            ${topRiskDistricts
              .map(
                (d) => `
                <li><strong>${d.district}</strong>: 
                    Risk Score ${d.avgRisk.toFixed(2)}/3.0 - 
                    ${identifyDisasters(d.data)}
                </li>
            `
              )
              .join("")}
        </ul>
    `;

  // Mitigation Strategies by Region
  const mitigationStrategies = topRiskDistricts
    .map((d) => {
      const strategies = [];
      const data = d.data;

      if (data.rainfall > 200) {
        strategies.push("Install flood barriers and improve drainage");
        strategies.push("Relocate vulnerable communities to higher ground");
      } else if (data.rainfall < 50) {
        strategies.push("Build water storage facilities");
        strategies.push("Introduce drip irrigation systems");
      }

      if (data.tmean > 30) {
        strategies.push("Create cooling centers for extreme heat events");
        strategies.push("Plant urban forests and green spaces");
      }

      if (data.soilMoisture < 20) {
        strategies.push("Implement terracing and contour farming");
        strategies.push("Distribute drought-resistant seeds");
      }

      return `
            <li>
                <strong>${d.district}:</strong>
                <ul style="margin-left: 20px; margin-top: 5px;">
                    ${strategies.map((s) => `<li>${s}</li>`).join("")}
                </ul>
            </li>
        `;
    })
    .join("");

  document.getElementById("ai-mitigation").innerHTML = `
        <ul>
            ${mitigationStrategies}
        </ul>
    `;
}

// Setup event listeners
function setupEventListeners() {
  // Metric buttons
  document.querySelectorAll(".metric-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document
        .querySelectorAll(".metric-btn")
        .forEach((b) => b.classList.remove("active"));
      e.currentTarget.classList.add("active");
      currentMetric = e.currentTarget.dataset.metric;
      updateCharts();
      updateMapLayers();
    });
  });

  // Filter changes
  ["filter-province", "filter-district", "filter-year", "filter-month"].forEach(
    (id) => {
      document.getElementById(id).addEventListener("change", () => {
        updateDashboard();
      });
    }
  );
}

// Update entire dashboard
function updateDashboard() {
  updateKPIs();
  updateTopSectors();
  updateMapLayers();
  updateCharts();
  updateTable();
  generateAISummary();
}
