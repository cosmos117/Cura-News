export const TOPICS = [
  { id: "politics-governance", label: "Politics & Governance", definition: "Government, elections, public administration, and political institutions.", includeKeywords: ["government", "election", "minister", "parliament", "cabinet", "president", "governance", "policy"], excludeKeywords: [] },
  { id: "economy-business", label: "Economy & Business", definition: "Markets, finance, trade, companies, jobs, and economic policy.", includeKeywords: ["economy", "business", "market", "bank", "rbi", "inflation", "budget", "trade", "company", "investment", "startup"], excludeKeywords: [] },
  { id: "world-affairs", label: "World Affairs", definition: "International relations, foreign governments, conflicts, and global institutions.", includeKeywords: ["international", "foreign", "diplomatic", "summit", "united nations", "russia", "ukraine", "china", "pakistan", "global"], excludeKeywords: [] },
  { id: "defence-security", label: "Defence & Security", definition: "Military affairs, policing, terrorism, intelligence, and national security.", includeKeywords: ["defence", "defense", "military", "army", "navy", "air force", "security", "terror", "missile", "police", "intelligence"], excludeKeywords: [] },
  { id: "law-judiciary", label: "Law & Judiciary", definition: "Courts, judges, legislation, legal proceedings, and constitutional matters.", includeKeywords: ["court", "judge", "judiciary", "supreme court", "high court", "legal", "law", "petition", "verdict", "bail"], excludeKeywords: [] },
  { id: "science-technology", label: "Science & Technology", definition: "Scientific research, digital technology, space, and innovation.", includeKeywords: ["science", "technology", "tech", "ai", "artificial intelligence", "semiconductor", "space", "isro", "nasa", "software", "chip"], excludeKeywords: [] },
  { id: "environment-climate", label: "Environment & Climate", definition: "Climate, pollution, conservation, biodiversity, and natural resources.", includeKeywords: ["environment", "climate", "pollution", "forest", "wildlife", "biodiversity", "carbon", "emissions", "heatwave"], excludeKeywords: [] },
  { id: "health", label: "Health", definition: "Healthcare, medicine, disease, hospitals, and public health.", includeKeywords: ["health", "hospital", "doctor", "medicine", "disease", "vaccine", "patient", "medical"], excludeKeywords: [] },
  { id: "education-society", label: "Education & Society", definition: "Education, social development, communities, and social welfare.", includeKeywords: ["education", "school", "university", "student", "society", "social", "welfare", "caste", "community"], excludeKeywords: [] },
  { id: "sports", label: "Sports", definition: "Competitive sport, athletes, teams, tournaments, and sporting bodies.", includeKeywords: ["sport", "cricket", "football", "tennis", "olympic", "medal", "match", "player", "tournament"], excludeKeywords: [] },
  { id: "entertainment", label: "Entertainment", definition: "Film, television, music, books, celebrities, and popular culture.", includeKeywords: ["film", "movie", "cinema", "actor", "actress", "director", "singer", "music", "television", "celebrity", "obituary"], excludeKeywords: [] },
  { id: "other", label: "Other", definition: "Stories that do not fit another primary topic.", includeKeywords: [], excludeKeywords: [] },
];

export const TOPIC_IDS = TOPICS.map((topic) => topic.id);
export const TOPIC_LABELS = Object.fromEntries(TOPICS.map((topic) => [topic.id, topic.label]));
export const topicById = (id) => TOPICS.find((topic) => topic.id === id);
