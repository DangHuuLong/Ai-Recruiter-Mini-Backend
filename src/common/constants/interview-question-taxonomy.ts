// Reference vocabulary for InterviewQuestionEntry.specialization/enablers/businessContext.
// Not DB-enforced (those fields are free-form strings) — these are the example values
// seed data and future CV/JD classifiers should converge on. See PLAN.md Phase 7.
import { OccupationFamily } from '@prisma/client';

export interface OccupationTaxonomyEntry {
  occupationFamily: OccupationFamily;
  specializations: string[];
  enablers: string[];
  businessContexts: string[];
}

export const INTERVIEW_QUESTION_TAXONOMY: OccupationTaxonomyEntry[] = [
  {
    occupationFamily: OccupationFamily.IT,
    specializations: [
      'Backend',
      'Frontend',
      'Mobile',
      'DevOps/SRE',
      'QA/Testing',
      'Data Engineering',
      'Security',
    ],
    enablers: ['Node.js', 'React', 'PostgreSQL', 'Docker', 'Kubernetes', 'AWS', 'CI/CD'],
    businessContexts: ['E-commerce', 'SaaS B2B', 'Fintech', 'Booking/Marketplace', 'CMS', 'IoT'],
  },
  {
    occupationFamily: OccupationFamily.MARKETING,
    specializations: [
      'Performance Marketing',
      'Content Marketing',
      'Brand Marketing',
      'SEO',
      'Social Media',
      'Marketing Automation',
    ],
    enablers: ['Google Ads', 'Meta Ads', 'GA4', 'SEMrush/Ahrefs', 'HubSpot'],
    businessContexts: [
      'B2B Lead Generation',
      'Product Launch',
      'Brand Awareness',
      'Retention/Loyalty',
      'E-commerce Growth',
    ],
  },
  {
    occupationFamily: OccupationFamily.DESIGN,
    specializations: [
      'UI/UX Design',
      'Graphic Design',
      'Brand/Visual Identity',
      'Motion Graphics',
      'Product Design',
    ],
    enablers: ['Figma', 'Adobe Illustrator', 'Adobe Photoshop', 'After Effects', 'Design System'],
    businessContexts: [
      'Rebranding',
      'UI Redesign',
      'Mobile App Design',
      'Packaging Design',
      'Design System Build',
    ],
  },
  {
    occupationFamily: OccupationFamily.DATA,
    specializations: ['Data Analyst', 'BI Engineer', 'Data Scientist', 'Data Engineer'],
    enablers: ['SQL', 'Power BI', 'Tableau', 'Python/Pandas', 'Looker Studio'],
    businessContexts: [
      'Sales Dashboard',
      'Churn Analysis',
      'A/B Test Analysis',
      'Financial Reporting Automation',
    ],
  },
  {
    occupationFamily: OccupationFamily.PRODUCT,
    specializations: ['B2B Product', 'B2C Product', 'Growth PM', 'Technical PM'],
    enablers: ['Jira', 'Notion', 'Amplitude', 'Mixpanel', 'A/B Testing Framework'],
    businessContexts: [
      'New Feature Launch',
      'Product-Market Fit Discovery',
      'Platform Migration',
      'Growth Loop Design',
    ],
  },
  {
    occupationFamily: OccupationFamily.SALES,
    specializations: ['Enterprise Sales', 'Inside Sales', 'Channel Sales', 'Account Management'],
    enablers: ['Salesforce', 'HubSpot CRM', 'SPIN Selling', 'Apollo', 'Lemlist'],
    businessContexts: [
      'New Market Entry',
      'Enterprise Deal Closing',
      'Key Account Management',
      'Churn Reduction',
    ],
  },
  {
    occupationFamily: OccupationFamily.LEGAL,
    specializations: ['Contract/Commercial Law', 'Compliance', 'IP Law', 'Labor Law'],
    enablers: ['Contract Management Software', 'Due Diligence Checklist'],
    businessContexts: [
      'M&A Due Diligence',
      'Contract Negotiation',
      'Compliance Audit',
      'IP Registration',
    ],
  },
];
