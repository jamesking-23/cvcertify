// Made-up example data used on the marketing pages. Nothing here belongs to a real person.
import { emptyContent } from '../shared/constants.js';

export const SAMPLE_ID = 'CVC-7QK2-M4XR-T9ND';

export function sampleContent() {
  const c = emptyContent();
  c.personal = { fullName: 'James Amani', headline: 'Operations Analyst', email: 'james.amani@example.com', phone: '+256 700 000 000', location: 'Kampala, Uganda', website: '', linkedin: 'linkedin.com/in/jamesamani', github: '', dob: '14 March 1998', nationality: 'Ugandan' };
  c.summary = 'Operations analyst with four years of experience improving dispatch and reporting for fast-growing logistics teams.';
  c.experience = [
    { id: 'a', role: 'Operations Analyst', company: 'Nile Logistics', location: 'Kampala', start: '2022-03', end: '', current: true, bullets: ['Cut delivery delays by 18% by redesigning dispatch scheduling.', 'Built weekly KPI dashboards used by 6 regional managers.'] },
    { id: 'b', role: 'Operations Assistant', company: 'Lake Freight Ltd', location: 'Entebbe', start: '2020-06', end: '2022-02', current: false, bullets: ['Reconciled 300+ monthly delivery records against invoices.'] },
  ];
  c.education = [
    { id: 'c', school: 'Makerere University', degree: 'BSc', field: 'Statistics', start: '2017-08', end: '2021-06', details: '' },
    { id: 'd', school: 'Hillcrest Senior School', degree: 'Uganda Advanced Certificate of Education', field: '', start: '2015-02', end: '2016-11', details: '' },
  ];
  c.skills = ['Excel', 'SQL', 'Power BI', 'Process improvement', 'Route planning'];
  c.certifications = [{ id: 'e', name: 'Data Analytics Certificate', issuer: 'Coursera', year: '2023' }];
  c.languages = [{ id: 'f', name: 'English', level: 'Fluent' }, { id: 'g', name: 'Luganda', level: 'Native' }];
  c.referees = [{ id: 'h', name: 'Ms. Grace Namatovu', title: 'Head of Operations', contact: '+256 700 000 001' }, { id: 'i', name: 'Mr. Peter Okello', title: 'Logistics Manager', contact: '+256 700 000 002' }];
  return c;
}

export const SAMPLE_LETTER = `Dear Sir/Madam,

I am writing to apply for the Operations Analyst role at Lakeshore Freight. At Nile Logistics I redesigned dispatch scheduling and cut delivery delays by 18%, and I would like to bring the same approach to your regional network.

I build the weekly KPI reporting that six regional managers use to decide where to send trucks, so I am used to turning messy delivery data into decisions people act on.

My CV is attached. Thank you for your time.

Yours faithfully,
James Amani`;

export const SAMPLE_JOB = { title: 'Operations Analyst', company: 'Lakeshore Freight', description: '' };
