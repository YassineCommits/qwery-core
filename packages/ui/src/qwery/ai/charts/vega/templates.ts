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
