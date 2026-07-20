import { describe, expect, it } from '@jest/globals';

import { mapStructuredResumeToParsedData } from './resume-structured.mapper';
import { ResumeStructuredInputDto } from './dto/resume-structured-input.dto';

describe('mapStructuredResumeToParsedData', () => {
  it('maps a fully populated input into snake_case ParsedResumeData', () => {
    const input: ResumeStructuredInputDto = {
      personal: {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '555-1234',
        location: 'Remote',
        linkedinUrl: 'https://linkedin.com/in/jane',
        githubUrl: 'https://github.com/jane',
        portfolioUrl: 'https://jane.dev',
      },
      summary: 'Senior backend engineer.',
      skills: [{ name: 'Node.js', category: 'Backend', evidence: 'Used at Acme', level: 'Expert' }],
      education: [
        {
          institution: 'MIT',
          degree: 'BSc',
          fieldOfStudy: 'CS',
          startYear: 2015,
          endYear: 2019,
          gpa: '3.8',
          gpaScale: '4',
          description: 'Honors',
        },
      ],
      experience: [
        {
          company: 'Acme',
          role: 'Engineer',
          location: 'Remote',
          startDate: '2020-01',
          endDate: '2023-01',
          durationMonths: 36,
          responsibilities: ['Built APIs'],
          technologies: ['Node.js'],
        },
      ],
      projects: [
        {
          name: 'Project X',
          role: 'Lead',
          startDate: '2021-01',
          endDate: '2021-06',
          description: 'A thing',
          technologies: ['TypeScript'],
          urls: ['https://example.com'],
        },
      ],
      certifications: [
        { name: 'AWS SAA', issuer: 'AWS', issuedYear: 2022, url: 'https://aws.example.com' },
      ],
      achievements: [{ title: 'Award', description: 'Best engineer', year: 2022 }],
      languages: [{ name: 'English', proficiency: 'Native' }],
    } as ResumeStructuredInputDto;

    const result = mapStructuredResumeToParsedData(input);

    expect(result.personal.full_name).toBe('Jane Doe');
    expect(result.personal.linkedin_url).toBe('https://linkedin.com/in/jane');
    expect(result.skills[0]).toEqual({
      name: 'Node.js',
      normalized_name: 'node.js',
      category: 'Backend',
      evidence: 'Used at Acme',
      level: 'Expert',
    });
    expect(result.education[0].field_of_study).toBe('CS');
    expect(result.experience[0].duration_months).toBe(36);
    expect(result.certifications[0].issued_year).toBe(2022);
  });

  it('defaults every array field to [] and every optional scalar to null when absent', () => {
    const result = mapStructuredResumeToParsedData({} as ResumeStructuredInputDto);

    expect(result.personal).toEqual({
      full_name: null,
      email: null,
      phone: null,
      location: null,
      linkedin_url: null,
      github_url: null,
      portfolio_url: null,
    });
    expect(result.summary).toBeNull();
    expect(result.skills).toEqual([]);
    expect(result.education).toEqual([]);
    expect(result.experience).toEqual([]);
    expect(result.projects).toEqual([]);
    expect(result.certifications).toEqual([]);
    expect(result.achievements).toEqual([]);
    expect(result.languages).toEqual([]);
  });

  it('lowercases and trims skill names into normalized_name', () => {
    const result = mapStructuredResumeToParsedData({
      skills: [{ name: '  PostgreSQL  ' }],
    } as ResumeStructuredInputDto);

    expect(result.skills[0].normalized_name).toBe('postgresql');
    expect(result.skills[0].name).toBe('  PostgreSQL  ');
  });
});
