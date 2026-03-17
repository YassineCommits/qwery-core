const BASE_SCHEMA_URL = 'https://vega.github.io/schema/vega-lite/v5.json';

export const BAR_CHART_SPEC_TEMPLATE = `
{
  "$schema": "${BASE_SCHEMA_URL}",
  "title": "{{title}}",
  "data": {
    "values": {{&dataJson}}
  },
  "mark": {
    "type": "bar"
  },
  "encoding": {
    "x": {
      "field": "{{xField}}",
      "type": "nominal",
      "axis": {
        "title": "{{xLabel}}"
      }
    },
    "y": {
      "field": "{{yField}}",
      "type": "quantitative",
      "axis": {
        "title": "{{yLabel}}"
      }
    },
    "color": {
      "value": "{{primaryColor}}"
    },
    "tooltip": [
      { "field": "{{xField}}", "type": "nominal", "title": "{{xLabel}}" },
      { "field": "{{yField}}", "type": "quantitative", "title": "{{yLabel}}" }
    ]
  }
}
`;

export const LINE_CHART_SPEC_TEMPLATE = `
{
  "$schema": "${BASE_SCHEMA_URL}",
  "title": "{{title}}",
  "data": {
    "values": {{&dataJson}}
  },
  "mark": {
    "type": "line",
    "point": true
  },
  "encoding": {
    "x": {
      "field": "{{xField}}",
      "type": "temporal",
      "axis": {
        "title": "{{xLabel}}"
      }
    },
    "y": {
      "field": "{{yField}}",
      "type": "quantitative",
      "axis": {
        "title": "{{yLabel}}"
      }
    },
    "color": {
      "value": "{{primaryColor}}"
    },
    "tooltip": [
      { "field": "{{xField}}", "type": "temporal", "title": "{{xLabel}}" },
      { "field": "{{yField}}", "type": "quantitative", "title": "{{yLabel}}" }
    ]
  }
}
`;

export const PIE_CHART_SPEC_TEMPLATE = `
{
  "$schema": "${BASE_SCHEMA_URL}",
  "title": "{{title}}",
  "data": {
    "values": {{&dataJson}}
  },
  "mark": {
    "type": "arc"
  },
  "encoding": {
    "theta": {
      "field": "{{valueField}}",
      "type": "quantitative"
    },
    "color": {
      "field": "{{categoryField}}",
      "type": "nominal",
      "legend": {
        "title": "{{categoryLabel}}"
      }
    },
    "tooltip": [
      { "field": "{{categoryField}}", "type": "nominal", "title": "{{categoryLabel}}" },
      { "field": "{{valueField}}", "type": "quantitative", "title": "{{valueLabel}}" }
    ]
  }
}
`;

export const DONUT_CHART_SPEC_TEMPLATE = `
{
  "$schema": "${BASE_SCHEMA_URL}",
  "title": "{{title}}",
  "data": {
    "values": {{&dataJson}}
  },
  "mark": {
    "type": "arc",
    "innerRadius": 50
  },
  "encoding": {
    "theta": {
      "field": "{{valueField}}",
      "type": "quantitative"
    },
    "color": {
      "field": "{{categoryField}}",
      "type": "nominal",
      "legend": {
        "title": "{{categoryLabel}}"
      }
    },
    "tooltip": [
      { "field": "{{categoryField}}", "type": "nominal", "title": "{{categoryLabel}}" },
      { "field": "{{valueField}}", "type": "quantitative", "title": "{{valueLabel}}" }
    ]
  }
}
`;

export const AREA_CHART_SPEC_TEMPLATE = `
{
  "$schema": "${BASE_SCHEMA_URL}",
  "title": "{{title}}",
  "data": {
    "values": {{&dataJson}}
  },
  "mark": {
    "type": "area",
    "line": true
  },
  "encoding": {
    "x": {
      "field": "{{xField}}",
      "type": "temporal",
      "axis": {
        "title": "{{xLabel}}"
      }
    },
    "y": {
      "field": "{{yField}}",
      "type": "quantitative",
      "axis": {
        "title": "{{yLabel}}"
      }
    },
    "color": {
      "value": "{{primaryColor}}"
    },
    "tooltip": [
      { "field": "{{xField}}", "type": "temporal", "title": "{{xLabel}}" },
      { "field": "{{yField}}", "type": "quantitative", "title": "{{yLabel}}" }
    ]
  }
}
`;

export const SCATTER_SPEC_TEMPLATE = `
{
  "$schema": "${BASE_SCHEMA_URL}",
  "title": "{{title}}",
  "data": {
    "values": {{&dataJson}}
  },
  "mark": {
    "type": "point",
    "tooltip": true
  },
  "encoding": {
    "x": {
      "field": "{{xField}}",
      "type": "quantitative",
      "axis": { "title": "{{xLabel}}" }
    },
    "y": {
      "field": "{{yField}}",
      "type": "quantitative",
      "axis": { "title": "{{yLabel}}" }
    },
    "color": { "value": "{{primaryColor}}" }
  }
}
`;

export const SCATTER_WITH_SERIES_SPEC_TEMPLATE = `
{
  "$schema": "${BASE_SCHEMA_URL}",
  "title": "{{title}}",
  "data": {
    "values": {{&dataJson}}
  },
  "mark": {
    "type": "point",
    "tooltip": true
  },
  "encoding": {
    "x": {
      "field": "{{xField}}",
      "type": "quantitative",
      "axis": { "title": "{{xLabel}}" }
    },
    "y": {
      "field": "{{yField}}",
      "type": "quantitative",
      "axis": { "title": "{{yLabel}}" }
    },
    "color": {
      "field": "{{seriesField}}",
      "type": "nominal",
      "legend": { "title": "{{seriesLabel}}" }
    }
  }
}
`;

export const HISTOGRAM_SPEC_TEMPLATE = `
{
  "$schema": "${BASE_SCHEMA_URL}",
  "title": "{{title}}",
  "data": {
    "values": {{&dataJson}}
  },
  "mark": "bar",
  "encoding": {
    "x": {
      "field": "{{xField}}",
      "type": "quantitative",
      "bin": true,
      "axis": { "title": "{{xLabel}}" }
    },
    "y": {
      "aggregate": "count",
      "type": "quantitative",
      "axis": { "title": "Count" }
    },
    "color": { "value": "{{primaryColor}}" }
  }
}
`;

export const HEATMAP_SPEC_TEMPLATE = `
{
  "$schema": "${BASE_SCHEMA_URL}",
  "title": "{{title}}",
  "data": {
    "values": {{&dataJson}}
  },
  "mark": "rect",
  "encoding": {
    "x": {
      "field": "{{xField}}",
      "type": "{{xType}}",
      "axis": { "title": "{{xLabel}}" }
    },
    "y": {
      "field": "{{yField}}",
      "type": "{{yType}}",
      "axis": { "title": "{{yLabel}}" }
    },
    "color": {
      "field": "{{valueField}}",
      "type": "quantitative",
      "legend": { "title": "{{valueLabel}}" }
    },
    "tooltip": [
      { "field": "{{xField}}", "type": "{{xType}}", "title": "{{xLabel}}" },
      { "field": "{{yField}}", "type": "{{yType}}", "title": "{{yLabel}}" },
      { "field": "{{valueField}}", "type": "quantitative", "title": "{{valueLabel}}" }
    ]
  }
}
`;

export const GROUPED_BAR_SPEC_TEMPLATE = `
{
  "$schema": "${BASE_SCHEMA_URL}",
  "title": "{{title}}",
  "data": { "values": {{&dataJson}} },
  "mark": "bar",
  "encoding": {
    "x": { "field": "{{xField}}", "type": "nominal", "axis": { "title": "{{xLabel}}" } },
    "xOffset": { "field": "{{seriesField}}" },
    "y": { "field": "{{yField}}", "type": "quantitative", "axis": { "title": "{{yLabel}}" } },
    "color": { "field": "{{seriesField}}", "type": "nominal", "legend": { "title": "{{seriesLabel}}" } },
    "tooltip": [
      { "field": "{{xField}}", "type": "nominal", "title": "{{xLabel}}" },
      { "field": "{{seriesField}}", "type": "nominal", "title": "{{seriesLabel}}" },
      { "field": "{{yField}}", "type": "quantitative", "title": "{{yLabel}}" }
    ]
  }
}
`;

export const STACKED_BAR_SPEC_TEMPLATE = `
{
  "$schema": "${BASE_SCHEMA_URL}",
  "title": "{{title}}",
  "data": { "values": {{&dataJson}} },
  "mark": "bar",
  "encoding": {
    "x": { "field": "{{xField}}", "type": "nominal", "axis": { "title": "{{xLabel}}" } },
    "y": { "field": "{{yField}}", "type": "quantitative", "stack": "zero", "axis": { "title": "{{yLabel}}" } },
    "color": { "field": "{{seriesField}}", "type": "nominal", "legend": { "title": "{{seriesLabel}}" } },
    "tooltip": [
      { "field": "{{xField}}", "type": "nominal", "title": "{{xLabel}}" },
      { "field": "{{seriesField}}", "type": "nominal", "title": "{{seriesLabel}}" },
      { "field": "{{yField}}", "type": "quantitative", "title": "{{yLabel}}" }
    ]
  }
}
`;
