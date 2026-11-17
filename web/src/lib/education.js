// The topics an article can belong to (mirrors `TOPICS` in the API's EducationArticle model), in the order they are offered.
export const EDUCATION_TOPIC_CHOICES = [
  ['ewaste-problem', 'The e-waste problem'],
  ['safe-disposal', 'Safe disposal'],
  ['reuse', 'Reuse and donation'],
  ['repair-benefits', 'Benefits of repair'],
  ['recycling', 'Recycling'],
  ['data-security', 'Data security'],
  ['sustainability', 'Sustainability'],
];

export const topicLabel = (value) => EDUCATION_TOPIC_CHOICES.find(([v]) => v === value)?.[1] || value;