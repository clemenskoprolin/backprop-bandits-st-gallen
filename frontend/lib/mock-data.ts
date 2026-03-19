import { Template } from './types'

/**
 * Static templates with inline variable editing.
 * These live entirely in the frontend -- no backend route needed.
 */
export const mockTemplates: Template[] = [
  {
    id: '1',
    name: 'Compare Materials',
    description: 'Statistically compare two or more materials',
    prompt: 'Compare {material_a} vs {material_b} — is there a statistically significant difference in {property}?',
    category: 'Analysis',
    variables: [
      { key: 'material_a', label: 'Material A', placeholder: 'e.g., Steel A', type: 'select', options: ['Steel A', 'Steel B', 'Aluminum', 'Titanium', 'Composite'] },
      { key: 'material_b', label: 'Material B', placeholder: 'e.g., Steel B', type: 'select', options: ['Steel A', 'Steel B', 'Aluminum', 'Titanium', 'Composite'] },
      { key: 'property', label: 'Property', placeholder: 'e.g., tensile strength', type: 'select', options: ['tensile strength', 'yield strength', 'elongation', 'hardness', 'fatigue resistance'] },
    ],
  },
  {
    id: '2',
    name: 'Find Outliers',
    description: 'Identify data points outside normal ranges',
    prompt: 'List all data points where {property} exceeds {threshold} {unit}',
    category: 'Query',
    variables: [
      { key: 'property', label: 'Property', placeholder: 'Select property', type: 'select', options: ['tensile strength', 'yield strength', 'elongation', 'hardness'] },
      { key: 'threshold', label: 'Threshold', placeholder: 'e.g., 400', type: 'number' },
      { key: 'unit', label: 'Unit', placeholder: 'e.g., MPa', type: 'select', options: ['MPa', 'GPa', '%', 'HRC', 'HV'] },
    ],
  },
  {
    id: '3',
    name: 'Trend Analysis',
    description: 'Detect trends in material properties over time',
    prompt: 'Is there a trend suggesting {property} will violate the boundary of {boundary_value} {unit}?',
    category: 'Analysis',
    variables: [
      { key: 'property', label: 'Property', placeholder: 'Select property', type: 'select', options: ['tensile strength', 'yield strength', 'elongation', 'hardness'] },
      { key: 'boundary_value', label: 'Boundary Value', placeholder: 'e.g., 350', type: 'number' },
      { key: 'unit', label: 'Unit', placeholder: 'e.g., MPa', type: 'select', options: ['MPa', 'GPa', '%', 'HRC'] },
    ],
  },
  {
    id: '4',
    name: 'Parameter Impact',
    description: 'Analyze how parameters affect properties',
    prompt: 'If I change {parameter} from {from_value} to {to_value}, how does that influence {property}?',
    category: 'Analysis',
    variables: [
      { key: 'parameter', label: 'Parameter', placeholder: 'e.g., temperature', type: 'select', options: ['temperature', 'pressure', 'cooling rate', 'holding time', 'composition'] },
      { key: 'from_value', label: 'From', placeholder: 'e.g., 800', type: 'text' },
      { key: 'to_value', label: 'To', placeholder: 'e.g., 900', type: 'text' },
      { key: 'property', label: 'Property', placeholder: 'Select property', type: 'select', options: ['tensile strength', 'yield strength', 'hardness', 'grain size'] },
    ],
  },
  {
    id: '5',
    name: 'Property Distribution',
    description: 'View distribution of a property',
    prompt: 'Show me the distribution of {property} across all {material_type} samples',
    category: 'Visualization',
    variables: [
      { key: 'property', label: 'Property', placeholder: 'Select property', type: 'select', options: ['tensile strength', 'yield strength', 'elongation', 'hardness'] },
      { key: 'material_type', label: 'Material Type', placeholder: 'e.g., Steel', type: 'select', options: ['Steel A', 'Steel B', 'Aluminum', 'Titanium', 'Composite', 'all'] },
    ],
  },
  {
    id: '6',
    name: 'Recent Tests',
    description: 'Query recent test results',
    prompt: 'Show me all test results from the last {time_period} for {material_type}',
    category: 'Query',
    variables: [
      { key: 'time_period', label: 'Time Period', placeholder: 'Select period', type: 'select', options: ['7 days', '14 days', '30 days', '90 days', '6 months', '1 year'] },
      { key: 'material_type', label: 'Material', placeholder: 'Select material', type: 'select', options: ['all materials', 'Steel A', 'Steel B', 'Aluminum', 'Titanium', 'Composite'] },
    ],
  },
]
