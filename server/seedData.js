const mongoose = require('mongoose');
const KnowledgeBase = require('./models/KnowledgeBase');
require('dotenv').config();

const sampleDocuments = [
  {
    title: "Company Working Hours Policy",
    content: `Standard working hours are from 9:00 AM to 5:00 PM, Monday through Friday.

Flexible hours: Employees may adjust their schedule within the range of 7:00 AM to 7:00 PM, with manager approval.

Core hours: All employees must be available from 10:00 AM to 3:00 PM for meetings and collaboration.

Lunch break: 1 hour unpaid break, typically taken between 12:00 PM and 2:00 PM.

Remote work: Up to 2 days per week remote work is allowed with manager approval.`,
    category: "policy",
    source: "manual",
    tags: ["working-hours", "policy", "remote-work"]
  },
  {
    title: "Vacation and Time Off Policy",
    content: `Vacation Accrual:
- 0-2 years: 15 days per year
- 3-5 years: 20 days per year
- 6+ years: 25 days per year

Sick Leave: 10 days per year

Holidays: 10 company holidays annually

Request Process:
1. Submit request through HR portal at least 2 weeks in advance
2. Manager approval required
3. Blackout periods: Last 2 weeks of December

Carryover: Up to 5 days can be carried to next year.`,
    category: "hr",
    source: "manual",
    tags: ["vacation", "time-off", "holidays", "hr"]
  },
  {
    title: "IT Support and Equipment",
    content: `IT Support Contact:
- Email: helpdesk@company.com
- Phone: Ext. 5555
- Hours: 8:00 AM - 6:00 PM

Equipment provided:
- Laptop (MacBook Pro or Dell XPS)
- Monitor, keyboard, mouse
- Headset for calls
- Company mobile phone (for certain roles)

Software:
- Microsoft 365 (Teams, Outlook, Office)
- Slack for communication
- Jira for project management
- VPN for remote access

Issue Resolution:
1. Contact helpdesk
2. Ticket number provided
3. Average response time: 2 hours
4. Escalation available for urgent issues`,
    category: "it",
    source: "manual",
    tags: ["it-support", "equipment", "software", "helpdesk"]
  },
  {
    title: "Employee Benefits Overview",
    content: `Health Insurance:
- Medical, dental, vision coverage
- Starts on first day of employment
- Company pays 80% of premium
- Dependents can be added

Retirement:
- 401(k) plan with 4% company match
- Eligibility starts after 90 days
- Various investment options

Other Benefits:
- Life insurance (2x annual salary)
- Disability insurance
- Tuition reimbursement ($5,000/year)
- Wellness program with gym reimbursement
- Parental leave: 12 weeks paid

Contact HR benefits team for details: benefits@company.com`,
    category: "benefits",
    source: "manual",
    tags: ["benefits", "insurance", "401k", "health"]
  }
];

async function seedDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing data
    await KnowledgeBase.deleteMany({ source: 'manual' });
    console.log('Cleared existing sample data');

    // Insert sample documents
    await KnowledgeBase.insertMany(sampleDocuments);
    console.log('✅ Sample data inserted successfully');

    // Create text index
    await KnowledgeBase.createIndexes();
    console.log('✅ Text index created');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

seedDatabase();