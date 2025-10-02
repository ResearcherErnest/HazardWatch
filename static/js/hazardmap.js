document.addEventListener("DOMContentLoaded", function () {
  const map = L.map("map", {
    // Make sure the map ID is correct
    center: [-1.9403, 29.8739],
    zoom: 8,
    maxBounds: [
      [-2.9, 28.8],
      [-1.0, 30.9],
    ],
    maxBoundsViscosity: 1.0,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  map.fitBounds([
    [-2.9, 28.8],
    [-1.0, 30.9],
  ]);

  let geojsonLayer;
  let allFeatures = [];

  // Fetch GeoJSON
  fetch("/static/data/hazards.geojson")
    .then((res) => res.json())
    .then((data) => {
      allFeatures = data.features || [];
      console.log("GeoJSON data loaded:", allFeatures); // Add this line
      buildFilters(allFeatures);
      applyFilters(true); // initial load

      document
        .getElementById("province-filter")
        .addEventListener("change", () => applyFilters());
      document
        .getElementById("subtype-filter")
        .addEventListener("change", () => applyFilters());
      document
        .getElementById("year-filter")
        .addEventListener("change", () => applyFilters());

      // Manual checklist add button (global handler)
      const addBtn = document.getElementById("manual-add-btn");
      if (addBtn) {
        addBtn.addEventListener("click", () => {
          const input = document.getElementById("manual-add-input");
          const text = input && input.value.trim();
          if (!text) return;
          const province =
            document.getElementById("province-filter").value || "all";
          addManualAction(province, text);
          input.value = "";
          applyFilters(); // refresh checklist
        });
      }
    })
    .catch((err) => {
      console.error("Error loading GeoJSON:", err);
      document.getElementById("map").innerHTML =
        '<p style="text-align:center; padding:20px;">Could not load map data.</p>';
    });

  // ------------------ Filters + draw map ------------------
  function applyFilters(isInitialLoad = false) {
    if (geojsonLayer) {
      map.removeLayer(geojsonLayer);
    }

    const selectedProvince = document.getElementById("province-filter").value;
    const selectedType = document.getElementById("subtype-filter").value;
    const selectedYear = document.getElementById("year-filter").value;

    const filtered = allFeatures.filter((f) => {
      const p = f.properties || {};
      const year = p.Date ? new Date(p.Date).getFullYear().toString() : null;
      return (
        (selectedProvince === "all" || p.Province === selectedProvince) &&
        (selectedType === "all" || p.Disaster_1 === selectedType) &&
        (selectedYear === "all" || year === selectedYear)
      );
    });

    updateKPIs(filtered);

    // Replace AI calls with computed insights + manual checklist
    const insights = computeInsights(filtered, selectedProvince);
    renderInsights(insights, selectedProvince);
    renderManualChecklist(selectedProvince, insights.recommendations || []);

    // Draw GeoJSON
    geojsonLayer = L.geoJSON(
      { type: "FeatureCollection", features: filtered },
      {
        style: styleByCases,
        onEachFeature: (feature, layer) => {
          const p = feature.properties || {};
          layer.bindTooltip(
            `<b>${p.District || "N/A"}</b><br>
             Disaster: ${p.Disaster_1 || "N/A"}<br>
             Deaths: ${p["Total Deat"] || 0}<br>
             Affected: ${p["Total Affe"] || 0}`
          );
        },
      }
    ).addTo(map);
  }

  // ------------------ Insights generation (no AI) ------------------
  function computeInsights(features, selectedProvince) {
    // Aggregate basic stats
    const totals = { totalEvents: 0, totalAffected: 0, totalDeaths: 0 };
    const byType = {};
    const byProvince = {};
    const byYear = {};

    features.forEach((f) => {
      const p = f.properties || {};
      totals.totalEvents += 1;
      const affected = Number(p["Total Affe"]) || 0;
      const deaths = Number(p["Total Deat"]) || 0;
      totals.totalAffected += affected;
      totals.totalDeaths += deaths;

      const type = (p.Disaster_1 || "Unknown").trim();
      byType[type] = (byType[type] || 0) + 1;

      const prov = p.Province || "Unknown";
      byProvince[prov] = (byProvince[prov] || 0) + 1;

      if (p.Date) {
        const y = new Date(p.Date).getFullYear();
        byYear[y] = (byYear[y] || 0) + 1;
      }
    });

    // Helper: top key
    const topKey = (obj) => {
      const entries = Object.entries(obj);
      if (!entries.length) return null;
      entries.sort((a, b) => b[1] - a[1]);
      return { key: entries[0][0], value: entries[0][1], entries };
    };

    const topType = topKey(byType);
    const topProvince = topKey(byProvince);
    const topYear = topKey(byYear);

    // Compose readable insight summary
    const summaryLines = [];
    summaryLines.push(`Total events: ${totals.totalEvents}`);
    summaryLines.push(
      `Total affected (sum): ${totals.totalAffected.toLocaleString()}`
    );
    summaryLines.push(
      `Total deaths (sum): ${totals.totalDeaths.toLocaleString()}`
    );
    if (topType)
      summaryLines.push(
        `Most frequent hazard: ${topType.key} (${topType.value} events)`
      );

    if (topProvince)
      summaryLines.push(
        `Province with most recorded events: ${topProvince.key} (${topProvince.value} events)`
      );
    if (topYear)
      summaryLines.push(
        `Busiest year (by event count): ${topYear.key} (${topYear.value} events)`
      );

    // Short list of leading hazards and counts
    if (topType && topType.entries.length) {
      const list = topType.entries
        .slice(0, 5)
        .map((e) => `${e[0]} (${e[1]})`)
        .join(", ");
      summaryLines.push(`Top hazards include: ${list}`);
    }

    // Generate simple, rule-based recommendations
    const recommendations = [];

    // If there are floods in the filtered set
    const floodCount = Object.keys(byType).reduce(
      (acc, k) => acc + (/flood/i.test(k) ? byType[k] : 0),
      0
    );
    const droughtCount = Object.keys(byType).reduce(
      (acc, k) => acc + (/drought/i.test(k) ? byType[k] : 0),
      0
    );
    const landslideCount = Object.keys(byType).reduce(
      (acc, k) => acc + (/landslide/i.test(k) ? byType[k] : 0),
      0
    );

    if (floodCount > 0) {
      recommendations.push(
        "Strengthen early-warning systems and community evacuation plans for flood-prone areas."
      );
      recommendations.push(
        "Invest in drainage improvements, river embankments, and floodplain management."
      );
      recommendations.push(
        "Conduct community flood-safety drills and update evacuation maps."
      );
    }
    if (droughtCount > 0) {
      recommendations.push(
        "Promote water-harvesting (rainwater tanks, ponds) and efficient irrigation."
      );
      recommendations.push(
        "Support drought-resistant crops, and create contingency water supplies for communities."
      );
    }
    if (landslideCount > 0) {
      recommendations.push(
        "Map landslide-prone slopes and restrict unsafe land-use; implement slope stabilization."
      );
      recommendations.push(
        "Scale up reforestation, check drainage on slopes, and train communities on early signs."
      );
    }

    // Cross-cutting recommendations
    if (totals.totalAffected > 1000) {
      recommendations.push(
        "Pre-position emergency relief stocks (food, water, shelter) in high-risk provinces."
      );
    }
    if (totals.totalDeaths > 0) {
      recommendations.push(
        "Strengthen local health response capacity and trauma/psychosocial support after events."
      );
    }

    // Province-specific tailoring
    if (selectedProvince && selectedProvince !== "all") {
      // compute province-specific aggregates from allFeatures (not just filtered) for better context
      const provFeatures = allFeatures.filter(
        (f) => f.properties && f.properties.Province === selectedProvince
      );
      const provTotals = {
        events: provFeatures.length,
        affected: 0,
        deaths: 0,
      };
      const provByType = {};
      provFeatures.forEach((f) => {
        const p = f.properties || {};
        provTotals.affected += Number(p["Total Affe"]) || 0;
        provTotals.deaths += Number(p["Total Deat"]) || 0;
        const t = (p.Disaster_1 || "Unknown").trim();
        provByType[t] = (provByType[t] || 0) + 1;
      });
      const provTopType = topKey(provByType);

      // Tailored recommendations
      if (provTopType && /flood/i.test(provTopType.key)) {
        recommendations.push(
          `For ${selectedProvince}: prioritize flood risk mapping, community early-warning and river-bank interventions.`
        );
      }
      if (provTopType && /drought/i.test(provTopType.key)) {
        recommendations.push(
          `For ${selectedProvince}: prioritize water security measures, drought-tolerant seeds and community water planning.`
        );
      }
      if (provTopType && /landslide/i.test(provTopType.key)) {
        recommendations.push(
          `For ${selectedProvince}: conduct slope-stability surveys, reforestation and slope-drainage fixes.`
        );
      }

      // Add governance / planning recommendations
      recommendations.push(
        `Create a provincial resilience plan that integrates hazard mapping, community awareness, and contingency funding.`
      );
      recommendations.push(
        `Regularly update local hazard maps and link them to development planning and infrastructure projects.`
      );
    }

    return {
      summaryLines: summaryLines,
      recommendations,
      stats: { totals, byType, byProvince, byYear },
    };
  }

  // ------------------ Render insights & manual checklist ------------------
  function renderInsights(insights, selectedProvince) {
    const summaryEl = document.getElementById("ai-summary");
    if (!summaryEl) return;

    // If 'all' show only general summary; if province selected show province-tailored summary + header
    if (selectedProvince && selectedProvince !== "all") {
      const summaryHtml = insights.summaryLines
        .map((l) => `<p style="margin:4px 0">${l}</p>`)
        .join("");
      summaryEl.innerHTML = `<h4 class="insights-title">Insights (Province: ${selectedProvince})</h4>${summaryHtml}`;
    } else {
      const listItems = insights.summaryLines
        .map((line) => `<li>${line}</li>`)
        .join("");
      summaryEl.innerHTML = `
        <h4 class="insights-title">General Insights</h4>
        <ul class="insights-list">${listItems}</ul>`;
    }
  }

  // Manual checklist functions: stores per-province in localStorage
  function storageKeyForProvince(province) {
    return `manual_checklist_${province || "all"}`;
  }

  function loadManualActions(province) {
    try {
      const key = storageKeyForProvince(province || "all");
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("loadManualActions error", e);
      return [];
    }
  }

  function saveManualActions(province, actions) {
    try {
      const key = storageKeyForProvince(province || "all");
      localStorage.setItem(key, JSON.stringify(actions));
    } catch (e) {
      console.error("saveManualActions error", e);
    }
  }

  function addManualAction(province, text) {
    const actions = loadManualActions(province);
    actions.push({ text, done: false, id: Date.now() });
    saveManualActions(province, actions);
  }

  function toggleActionDone(province, id) {
    const actions = loadManualActions(province);
    const idx = actions.findIndex((a) => a.id === id);
    if (idx >= 0) {
      actions[idx].done = !actions[idx].done;
      saveManualActions(province, actions);
    }
  }

  function removeAction(province, id) {
    let actions = loadManualActions(province);
    actions = actions.filter((a) => a.id !== id);
    saveManualActions(province, actions);
  }

  function renderManualChecklist(province, autoRecommendations) {
    const container = document.getElementById("ai-checklist");
    if (!container) return;
    container.innerHTML = "";

    // Show a header and quick buttons
    const header = document.createElement("div");
    header.className = "checklist-header";
    header.innerHTML = `<h4>Disaster Preparedness Checklist ${
      province && province !== "all" ? `: ${province}` : ""
    }</h4>`;
    container.appendChild(header);

    // Show auto-generated recommendations (read-only) — only show when province selected
    if (
      province &&
      province !== "all" &&
      autoRecommendations &&
      autoRecommendations.length
    ) {
      const autoDiv = document.createElement("div");
      autoDiv.className = "auto-recs";
      autoDiv.innerHTML = "<strong>Suggested actions (auto):</strong>";
      const ul = document.createElement("ul");
      autoRecommendations.forEach((r) => {
        const li = document.createElement("li");
        li.textContent = r;
        ul.appendChild(li);
      });
      autoDiv.appendChild(ul);
      container.appendChild(autoDiv);
    } else if (!province || province === "all") {
      const p = document.createElement("p");
      p.className = "text-muted";
      p.style.marginBottom = "8px";
      p.textContent =
        "Select a province to see province-specific suggested actions. Use the manual checklist below to add or track actions.";
      container.appendChild(p);
    }

    // Manual actions list
    const actions = loadManualActions(province || "all");
    const ul = document.createElement("ul");
    ul.className = "checklist-items";
    actions.forEach((item) => {
      const li = document.createElement("li");
      li.className = "checklist-item";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!item.done;
      input.addEventListener("change", () => {
        toggleActionDone(province || "all", item.id);
        applyFilters();
      });

      const label = document.createElement("label");
      label.style.marginLeft = "8px";
      label.textContent = item.text;

      const del = document.createElement("button");
      del.className = "btn btn-sm btn-link text-danger";
      del.style.marginLeft = "8px";
      del.textContent = "Remove";
      del.addEventListener("click", () => {
        removeAction(province || "all", item.id);
        applyFilters();
      });

      li.appendChild(input);
      li.appendChild(label);
      li.appendChild(del);
      ul.appendChild(li);
    });

    container.appendChild(ul);

    // If there are no manual actions, prompt user to add
    if (!actions.length) {
      const note = document.createElement("p");
      note.className = "text-muted";
      container.appendChild(note);
    }
  }

  // ------------------ Style helpers ------------------
  function styleByCases(feature) {
    const affected = Number(feature.properties["Total Affe"]) || 0;
    return {
      fillColor: getColor(affected),
      weight: 1,
      opacity: 1,
      color: "white",
      dashArray: "3",
      fillOpacity: 0.7,
    };
  }

  function getColor(x) {
    return x > 5000
      ? "#800026"
      : x > 2000
      ? "#BD0026"
      : x > 1000
      ? "#E31A1C"
      : x > 500
      ? "#FC4E2A"
      : x > 100
      ? "#FD8D3C"
      : x > 50
      ? "#FEB24C"
      : x > 10
      ? "#FED976"
      : "#FFEDA0";
  }

  // ------------------ Dropdown builders + KPIs ------------------
  function buildFilters(features) {
    const provinces = new Set();
    const types = new Set();
    const years = new Set();

    features.forEach((f) => {
      const p = f.properties || {};
      if (p.Province) provinces.add(p.Province);
      if (p.Disaster_1) types.add(p.Disaster_1);
      if (p.Date) years.add(new Date(p.Date).getFullYear());
    });

    fillSelect("province-filter", provinces);
    fillSelect("subtype-filter", types);
    fillSelect("year-filter", years);
  }

  function fillSelect(id, values) {
    const select = document.getElementById(id);
    if (!select) return;
    // Clear previous options except the first one (e.g., "All Provinces")
    while (select.options.length > 1) {
      select.remove(1);
    }

    const sorted = Array.from(values).sort();
    sorted.forEach((v) => {
      const option = document.createElement("option");
      option.value = v;
      option.textContent = v;
      select.appendChild(option);
    });
  }

  function updateKPIs(features) {
    const flood = features.filter((f) =>
      f.properties.Disaster_1?.toLowerCase().includes("flood")
    ).length;
    const drought = features.filter((f) =>
      f.properties.Disaster_1?.toLowerCase().includes("drought")
    ).length;
    const landslide = features.filter((f) =>
      f.properties.Disaster_1?.toLowerCase().includes("landslide")
    ).length;
    const totalDeaths = features.reduce(
      (sum, f) => sum + (Number(f.properties["Total Deat"]) || 0),
      0
    );
    const totalAffected = features.reduce(
      (sum, f) => sum + (Number(f.properties["Total Affe"]) || 0),
      0
    );

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setText("kpi-flood-value", flood);
    setText("kpi-drought-value", drought);
    setText("kpi-landslide-value", landslide);
    setText("kpi-total-value", features.length);
    setText("kpi-deaths-value", totalDeaths.toLocaleString());
    setText("kpi-affected-value", totalAffected.toLocaleString());
  }

  // ------------------ Utilities ------------------
  // CSRF helper preserved (in case app needs it elsewhere)
  function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== "") {
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.substring(0, name.length + 1) === name + "=") {
          cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
          break;
        }
      }
    }
    return cookieValue;
  }
});
