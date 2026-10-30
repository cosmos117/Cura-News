import {
  Landmark,
  Edit,
  Briefcase,
  Shapes,
  Globe2,
  Shield,
  Scale,
  Cpu,
  Leaf,
  Heart,
  Users,
  Image,
  Trophy,
  Clapperboard,
} from "lucide-react";

/** Icon per category, shared by the dashboard topic cards and the For You picker. */
export const TOPIC_ICONS = {
  "Politics & Governance": Landmark,
  "Opinion & Editorial": Edit,
  "Economy & Business": Briefcase,
  "Agriculture & Rural": Shapes,
  "World Affairs": Globe2,
  "Defence & Security": Shield,
  "Law & Judiciary": Scale,
  "Science & Technology": Cpu,
  "Environment & Climate": Leaf,
  "Health": Heart,
  "Education & Society": Users,
  "Culture & Lifestyle": Image,
  Sports: Trophy,
  Entertainment: Clapperboard,
  Misc: Shapes,
};

export const topicIcon = (category) => TOPIC_ICONS[category] || Shapes;
