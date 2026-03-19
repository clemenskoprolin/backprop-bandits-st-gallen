import { Template } from './types'

// Real values queried from MongoDB (txp_clean._tests), 2026-03-19
const CUSTOMERS = [
  'Company_1', 'Company_2', 'Company_3', 'Company_4', 'Company_5',
  'Company_6', 'Company_7', 'Company_8', 'Company_9', 'Company_10',
  'Company_11', 'Company_12', 'Company_13', 'Company_14', 'Company_17',
  'Company_19', 'Company_20', 'Company_21', 'Company_23', 'Company_24',
  'Company_25', 'Company_26', 'Company_28', 'Company_37', 'Company_39',
  'Company_40', 'Company_50', 'Company_51', 'Company_59', 'Company_60',
]

const TESTERS = [
  'Tester_1', 'Tester_2', 'Tester_3', 'Tester_4', 'Tester_5',
  'Tester_6', 'Tester_7', 'Tester_8', 'Tester_9', 'Tester_10',
  'Tester_11', 'Tester_12', 'Tester_13', 'Tester_14', 'Tester_15',
  'Tester_16', 'Tester_17', 'Tester_18', 'Tester_19', 'Tester_20',
]

const SPECIMEN_TYPES = [
  'IPS', 'DIN 53504', 'Typ 1B', 'Typ 2', 'Typ 4', 'Typ 5',
  'Type 2', 'Type B', 'Flat specimens', 'Flat bar', 'Round specimen',
  'Schulterprobe Typ 2', 'Draht', 'Garn', 'Streifenprobe', 'Schlauch',
  'dog bone shape', 'dumbell sample',
]

const TEST_TYPES = ['tensile', 'compression', 'flexure']

const PROPERTIES = [
  'tensile strength',
  "Young's modulus",
  'elongation at break',
  'maximum force',
  'yield strength',
  'compression strength',
  'flexural strength',
  'strain at break',
]

const TIME_PERIODS = ['1 month', '3 months', '6 months', '1 year', '2 years']

const UNITS = ['MPa', 'GPa', 'N', 'kN', '%', 'mm']

/**
 * Static templates with inline variable editing.
 * These live entirely in the frontend — no backend route needed.
 * All option lists are sourced from the real database (2026-03-19).
 */
export const mockTemplates: Template[] = [
  // ─── Query ──────────────────────────────────────────────────────────────────
  {
    id: '1',
    name: 'Show Tests by Customer',
    description: 'List all tests performed for a specific customer, optionally filtered by test type',
    prompt: 'Show me all {test_type} tests we have done for customer {customer}',
    category: 'Query',
    variables: [
      {
        key: 'customer',
        label: 'Customer',
        placeholder: 'Select customer',
        type: 'select',
        options: CUSTOMERS,
        defaultValue: 'Company_1',
      },
      {
        key: 'test_type',
        label: 'Test Type',
        placeholder: 'Select test type',
        type: 'select',
        options: [...TEST_TYPES, 'all'],
        defaultValue: 'tensile',
      },
    ],
  },
  {
    id: '2',
    name: 'Show Tests by Tester',
    description: 'Retrieve all tests carried out by a particular tester',
    prompt: 'List all {test_type} tests performed by tester {tester}',
    category: 'Query',
    variables: [
      {
        key: 'tester',
        label: 'Tester',
        placeholder: 'Select tester',
        type: 'select',
        options: TESTERS,
        defaultValue: 'Tester_1',
      },
      {
        key: 'test_type',
        label: 'Test Type',
        placeholder: 'Select test type',
        type: 'select',
        options: [...TEST_TYPES, 'all'],
        defaultValue: 'tensile',
      },
    ],
  },
  {
    id: '3',
    name: 'Summarize Material Properties',
    description: 'Get an overview of all measured properties for a given specimen type',
    prompt: 'Summarize all available material properties for specimen type {specimen_type}',
    category: 'Query',
    variables: [
      {
        key: 'specimen_type',
        label: 'Specimen Type',
        placeholder: 'Select specimen type',
        type: 'select',
        options: SPECIMEN_TYPES,
        defaultValue: 'IPS',
      },
    ],
  },
  {
    id: '4',
    name: 'Filter by Threshold',
    description: 'Find all data points where a property exceeds a given threshold',
    prompt: 'List all {test_type} data points where {property} exceeds {threshold} {unit}',
    category: 'Query',
    variables: [
      {
        key: 'test_type',
        label: 'Test Type',
        placeholder: 'Select test type',
        type: 'select',
        options: TEST_TYPES,
        defaultValue: 'tensile',
      },
      {
        key: 'property',
        label: 'Property',
        placeholder: 'Select property',
        type: 'select',
        options: PROPERTIES,
        defaultValue: 'tensile strength',
      },
      {
        key: 'threshold',
        label: 'Threshold',
        placeholder: 'e.g. 400',
        type: 'number',
      },
      {
        key: 'unit',
        label: 'Unit',
        placeholder: 'Select unit',
        type: 'select',
        options: UNITS,
        defaultValue: 'MPa',
      },
    ],
  },
  // ─── Analysis ───────────────────────────────────────────────────────────────
  {
    id: '5',
    name: 'Compare Specimen Types',
    description: 'Statistically compare a property between two specimen types',
    prompt: 'Compare {material_a} and {material_b} — is there a statistically significant difference in {property}?',
    category: 'Analysis',
    variables: [
      {
        key: 'material_a',
        label: 'Specimen Type A',
        placeholder: 'Select first type',
        type: 'select',
        options: SPECIMEN_TYPES,
        defaultValue: 'IPS',
      },
      {
        key: 'material_b',
        label: 'Specimen Type B',
        placeholder: 'Select second type',
        type: 'select',
        options: SPECIMEN_TYPES,
        defaultValue: 'Typ 1B',
      },
      {
        key: 'property',
        label: 'Property',
        placeholder: 'Select property',
        type: 'select',
        options: PROPERTIES,
        defaultValue: 'tensile strength',
      },
    ],
  },
  {
    id: '6',
    name: 'Trend / Boundary Violation',
    description: 'Detect if a property is trending toward violating a specification limit',
    prompt: 'Is there a trend suggesting {property} will violate the boundary of {boundary_value} {unit} for {material}?',
    category: 'Analysis',
    variables: [
      {
        key: 'material',
        label: 'Specimen Type / Material',
        placeholder: 'Select or type material',
        type: 'select',
        options: SPECIMEN_TYPES,
        defaultValue: 'IPS',
      },
      {
        key: 'property',
        label: 'Property',
        placeholder: 'Select property',
        type: 'select',
        options: PROPERTIES,
        defaultValue: 'tensile strength',
      },
      {
        key: 'boundary_value',
        label: 'Boundary Value',
        placeholder: 'e.g. 350',
        type: 'number',
      },
      {
        key: 'unit',
        label: 'Unit',
        placeholder: 'Select unit',
        type: 'select',
        options: UNITS,
        defaultValue: 'MPa',
      },
    ],
  },
  {
    id: '7',
    name: 'Degradation Over Time',
    description: 'Check if a material property is degrading over a time window',
    prompt: 'Is there a degradation in {property} for {specimen_type} over the last {time_period}?',
    category: 'Analysis',
    variables: [
      {
        key: 'specimen_type',
        label: 'Specimen Type',
        placeholder: 'Select specimen type',
        type: 'select',
        options: SPECIMEN_TYPES,
        defaultValue: 'IPS',
      },
      {
        key: 'property',
        label: 'Property',
        placeholder: 'Select property',
        type: 'select',
        options: PROPERTIES,
        defaultValue: 'tensile strength',
      },
      {
        key: 'time_period',
        label: 'Time Period',
        placeholder: 'Select period',
        type: 'select',
        options: TIME_PERIODS,
        defaultValue: '6 months',
      },
    ],
  },
  {
    id: '8',
    name: 'Compare Testers / Machines',
    description: 'Check whether two testers or machines produce significantly different results',
    prompt: 'Do {tester_a} and {tester_b} produce significantly different results for {test_type} tests?',
    category: 'Analysis',
    variables: [
      {
        key: 'tester_a',
        label: 'Tester A',
        placeholder: 'Select first tester',
        type: 'select',
        options: TESTERS,
        defaultValue: 'Tester_1',
      },
      {
        key: 'tester_b',
        label: 'Tester B',
        placeholder: 'Select second tester',
        type: 'select',
        options: TESTERS,
        defaultValue: 'Tester_2',
      },
      {
        key: 'test_type',
        label: 'Test Type',
        placeholder: 'Select test type',
        type: 'select',
        options: TEST_TYPES,
        defaultValue: 'tensile',
      },
    ],
  },
  // ─── Visualization ──────────────────────────────────────────────────────────
  {
    id: '9',
    name: 'Property Distribution',
    description: 'Visualise the spread of a property across all tests of a given type',
    prompt: 'Show me the distribution of {property} across all {test_type} tests',
    category: 'Visualization',
    variables: [
      {
        key: 'property',
        label: 'Property',
        placeholder: 'Select property',
        type: 'select',
        options: PROPERTIES,
        defaultValue: 'tensile strength',
      },
      {
        key: 'test_type',
        label: 'Test Type',
        placeholder: 'Select test type',
        type: 'select',
        options: TEST_TYPES,
        defaultValue: 'tensile',
      },
    ],
  },
  {
    id: '10',
    name: 'Recent Tests Overview',
    description: 'Chart all test results from the last N months for a customer',
    prompt: 'Show me all {test_type} test results from the last {time_period} for {customer}',
    category: 'Visualization',
    variables: [
      {
        key: 'customer',
        label: 'Customer',
        placeholder: 'Select customer',
        type: 'select',
        options: CUSTOMERS,
        defaultValue: 'Company_1',
      },
      {
        key: 'test_type',
        label: 'Test Type',
        placeholder: 'Select test type',
        type: 'select',
        options: [...TEST_TYPES, 'all'],
        defaultValue: 'tensile',
      },
      {
        key: 'time_period',
        label: 'Time Period',
        placeholder: 'Select period',
        type: 'select',
        options: TIME_PERIODS,
        defaultValue: '6 months',
      },
    ],
  },
]
