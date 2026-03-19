import { Session, Message, Template, ChatResponse, Visualization } from './types'

// Mock sessions
export const mockSessions: Session[] = [
  {
    session_id: '1',
    title: 'Tensile Strength Analysis',
    updated_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    message_count: 4,
  },
  {
    session_id: '2',
    title: 'Material Comparison Study',
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    message_count: 8,
  },
  {
    session_id: '3',
    title: 'Yield Point Investigation',
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    message_count: 3,
  },
]

// Mock templates with variables for inline editing
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

// Mock chart visualization
const mockChartVisualization: Visualization = {
  type: 'chart',
  data: {
    chartType: 'bar',
    title: 'Tensile Strength by Material Type',
    description: 'Comparison of average tensile strength across material categories',
    xAxis: 'Material',
    yAxis: 'Tensile Strength (MPa)',
    data: [
      { material: 'Steel A', tensileStrength: 450, yieldStrength: 380 },
      { material: 'Steel B', tensileStrength: 520, yieldStrength: 420 },
      { material: 'Aluminum', tensileStrength: 310, yieldStrength: 275 },
      { material: 'Titanium', tensileStrength: 890, yieldStrength: 780 },
      { material: 'Composite', tensileStrength: 650, yieldStrength: 580 },
    ],
    series: [
      { key: 'tensileStrength', label: 'Tensile Strength', color: 'var(--chart-1)' },
      { key: 'yieldStrength', label: 'Yield Strength', color: 'var(--chart-2)' },
    ],
  },
}

const mockLineVisualization: Visualization = {
  type: 'chart',
  data: {
    chartType: 'line',
    title: 'Tensile Strength Trend Over Time',
    description: 'Monthly average tensile strength measurements',
    xAxis: 'Month',
    yAxis: 'Tensile Strength (MPa)',
    data: [
      { month: 'Jan', actual: 445, target: 450 },
      { month: 'Feb', actual: 452, target: 450 },
      { month: 'Mar', actual: 448, target: 450 },
      { month: 'Apr', actual: 461, target: 450 },
      { month: 'May', actual: 455, target: 450 },
      { month: 'Jun', actual: 468, target: 450 },
    ],
    series: [
      { key: 'actual', label: 'Actual', color: 'var(--chart-1)' },
      { key: 'target', label: 'Target', color: 'var(--chart-3)' },
    ],
  },
}

const mockTableVisualization: Visualization = {
  type: 'table',
  data: {
    title: 'Data Points with Tensile Strength > 400 MPa',
    columns: [
      { key: 'sampleId', label: 'Sample ID', type: 'string' },
      { key: 'material', label: 'Material', type: 'string' },
      { key: 'tensileStrength', label: 'Tensile Strength (MPa)', type: 'number' },
      { key: 'testDate', label: 'Test Date', type: 'string' },
    ],
    rows: [
      { sampleId: 'S-001', material: 'Steel A', tensileStrength: 452, testDate: '2026-03-15' },
      { sampleId: 'S-004', material: 'Steel B', tensileStrength: 518, testDate: '2026-03-14' },
      { sampleId: 'S-007', material: 'Titanium', tensileStrength: 892, testDate: '2026-03-13' },
      { sampleId: 'S-012', material: 'Composite', tensileStrength: 645, testDate: '2026-03-12' },
      { sampleId: 'S-015', material: 'Steel A', tensileStrength: 448, testDate: '2026-03-11' },
    ],
  },
}

const mockCardsVisualization: Visualization = {
  type: 'cards',
  data: {
    title: 'Material Testing Summary',
    cards: [
      {
        title: 'Total Tests',
        value: 1247,
        description: 'Tests conducted this month',
        trend: { direction: 'up', value: '+12%' },
      },
      {
        title: 'Avg Tensile Strength',
        value: '468 MPa',
        description: 'Across all materials',
        trend: { direction: 'up', value: '+3.2%' },
      },
      {
        title: 'Pass Rate',
        value: '94.2%',
        description: 'Within specification',
        trend: { direction: 'down', value: '-0.8%' },
      },
      {
        title: 'Outliers Detected',
        value: 23,
        description: 'Requiring review',
        trend: { direction: 'neutral', value: '0%' },
      },
    ],
  },
}

// Mock messages for a session
export const mockMessages: Message[] = [
  {
    message_id: 'm1',
    role: 'user',
    content: 'List all data points with tensile strength > 400 MPa',
    timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
  },
  {
    message_id: 'm2',
    role: 'assistant',
    content: `I found **47 data points** with tensile strength exceeding 400 MPa in your dataset. Here's a summary of the results:\n\nThe materials showing high tensile strength are predominantly from the Steel B, Titanium, and Composite categories. The highest recorded value is **892 MPa** for a Titanium sample (S-007).\n\nThe table below shows the top results sorted by tensile strength.`,
    visualization: mockTableVisualization,
    query_used: 'SELECT sample_id, material, tensile_strength, test_date FROM test_results WHERE tensile_strength > 400 ORDER BY tensile_strength DESC LIMIT 5',
    timestamp: new Date(Date.now() - 1000 * 60 * 34).toISOString(),
    thinking: [
      'Parsing user query for tensile strength threshold',
      'Generating SQL query with WHERE clause for tensile_strength > 400',
      'Executing query against test_results table',
      'Formatting results as table visualization',
    ],
    followups: [
      'What is the average tensile strength for each material type?',
      'Show me the distribution of these high-strength samples over time',
      'Are there any correlations between tensile strength and other properties?',
    ],
  },
  {
    message_id: 'm3',
    role: 'user',
    content: 'Compare the tensile and yield strength across different materials',
    timestamp: new Date(Date.now() - 1000 * 60 * 32).toISOString(),
  },
  {
    message_id: 'm4',
    role: 'assistant',
    content: `Here's a comparison of **tensile strength** and **yield strength** across your material categories.\n\n**Key Insights:**\n- **Titanium** shows the highest values for both properties (890 MPa / 780 MPa)\n- **Steel B** outperforms **Steel A** by approximately 15% in both metrics\n- The **yield-to-tensile ratio** is consistent across materials (~0.84-0.89)\n\nThis indicates good material consistency in your production process.`,
    visualization: mockChartVisualization,
    query_used: 'SELECT material, AVG(tensile_strength) as tensileStrength, AVG(yield_strength) as yieldStrength FROM test_results GROUP BY material',
    timestamp: new Date(Date.now() - 1000 * 60 * 31).toISOString(),
    thinking: [
      'Identifying comparison request between two properties',
      'Selecting bar chart as optimal visualization',
      'Aggregating data by material type',
      'Calculating averages for both tensile and yield strength',
    ],
    followups: [
      'Is the difference between Steel A and Steel B statistically significant?',
      'Show me the trend of these values over the past 6 months',
      'What factors might explain the lower values for Aluminum?',
    ],
  },
]

// Simulate API delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Mock API functions
export async function fetchSessions(): Promise<Session[]> {
  await delay(300)
  return mockSessions
}

export async function fetchSession(id: string): Promise<{ session: Session; messages: Message[] }> {
  await delay(300)
  const session = mockSessions.find((s) => s.session_id === id) || mockSessions[0]
  return { session, messages: mockMessages }
}

export async function createSession(): Promise<Session> {
  await delay(200)
  const newSession: Session = {
    session_id: `${Date.now()}`,
    title: 'New Analysis',
    updated_at: new Date().toISOString(),
    message_count: 0,
  }
  return newSession
}

export async function deleteSession(id: string): Promise<void> {
  await delay(200)
  console.log('Deleted session:', id)
}

export async function renameSession(id: string, title: string): Promise<void> {
  await delay(200)
  console.log('Renamed session:', id, 'to', title)
}

export async function fetchTemplates(): Promise<Template[]> {
  await delay(200)
  return mockTemplates
}

export async function submitFeedback(payload: { message_id: string; rating: 'up' | 'down'; comment?: string }): Promise<void> {
  await delay(200)
  console.log('Feedback submitted:', payload)
}

// Mock chat response with different visualizations based on query
export async function sendMessage(sessionId: string, message: string): Promise<ChatResponse> {
  await delay(1500) // Simulate thinking time

  let visualization: Visualization | null = null
  let text = ''
  let followups: string[] = []
  let query = ''

  if (message.toLowerCase().includes('compare') || message.toLowerCase().includes('vs')) {
    visualization = mockChartVisualization
    text = `Based on your comparison request, I've analyzed the data and found significant differences between the materials.\n\n**Statistical Summary:**\n- The mean tensile strength varies significantly across material types (p < 0.05)\n- Titanium shows the highest performance metrics\n- Steel variants show consistent quality with low standard deviation`
    followups = [
      'Can you perform a t-test between Steel A and Steel B?',
      'What batch numbers have the highest variation?',
      'Show me outliers in this dataset',
    ]
    query = 'SELECT material, AVG(tensile_strength), STDDEV(tensile_strength) FROM test_results GROUP BY material'
  } else if (message.toLowerCase().includes('trend') || message.toLowerCase().includes('over time')) {
    visualization = mockLineVisualization
    text = `I've analyzed the temporal trends in your data.\n\n**Trend Analysis:**\n- Overall **upward trend** detected (+4.5% over the period)\n- Values consistently exceed the target threshold\n- June shows the highest average at 468 MPa\n\nThe trend suggests process improvements are having a positive effect.`
    followups = [
      'What factors correlate with this improvement?',
      'Forecast the next 3 months based on this trend',
      'Are there any seasonal patterns?',
    ]
    query = 'SELECT DATE_TRUNC(month, test_date) as month, AVG(tensile_strength) FROM test_results GROUP BY month ORDER BY month'
  } else if (message.toLowerCase().includes('list') || message.toLowerCase().includes('show') || message.toLowerCase().includes('find')) {
    visualization = mockTableVisualization
    text = `Here are the results matching your query criteria.\n\nI found **${Math.floor(Math.random() * 50) + 20} records** that match your specifications. The table shows the most relevant entries sorted by relevance.`
    followups = [
      'Export this data to CSV',
      'Show me the statistical summary of these results',
      'Filter by specific date range',
    ]
    query = 'SELECT * FROM test_results WHERE conditions ORDER BY relevance LIMIT 50'
  } else if (message.toLowerCase().includes('summary') || message.toLowerCase().includes('overview')) {
    visualization = mockCardsVisualization
    text = `Here's an overview of your material testing data.\n\nThe dashboard shows key performance indicators across your testing operations. Overall performance is **strong** with a 94.2% pass rate.`
    followups = [
      'What are the main reasons for test failures?',
      'Compare this month to the previous month',
      'Show me the trend of pass rate over time',
    ]
    query = 'SELECT COUNT(*), AVG(tensile_strength), SUM(CASE WHEN passed THEN 1 ELSE 0 END)/COUNT(*) FROM test_results'
  } else {
    text = `I've analyzed your query and here's what I found:\n\n${message}\n\nBased on the available data, I can help you explore this further. Would you like me to create a visualization or dig deeper into the statistical analysis?`
    followups = [
      'Create a chart showing the distribution',
      'Perform statistical significance testing',
      'Show me related data points',
    ]
    query = ''
  }

  return {
    session_id: sessionId,
    message_id: `m_${Date.now()}`,
    text,
    visualization,
    followups,
    query_used: query || null,
    thinking: [
      'Analyzing natural language query',
      'Identifying relevant database tables',
      'Generating optimized SQL query',
      'Processing results and creating visualization',
    ],
  }
}
