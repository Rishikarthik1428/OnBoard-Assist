const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const seedUsers = [
  {
    email: 'admin@company.com',
    password: 'Admin123!',
    name: 'System Admin',
    role: 'admin',
    department: 'IT',
    position: 'System Administrator',
    employeeId: 'ADM001'
  },
  {
    email: 'hr@company.com',
    password: 'Hr123!',
    name: 'HR Manager',
    role: 'hr',
    department: 'Human Resources',
    position: 'HR Manager',
    employeeId: 'HRM001'
  },
  {
    email: 'john.doe@company.com',
    password: 'Employee123!',
    name: 'John Doe',
    role: 'employee',
    department: 'Engineering',
    position: 'Software Developer',
    employeeId: 'ENG001'
  },
  {
    email: 'jane.smith@company.com',
    password: 'Employee123!',
    name: 'Jane Smith',
    role: 'employee',
    department: 'Marketing',
    position: 'Marketing Specialist',
    employeeId: 'MKT001'
  }
];

async function seedDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing users
    await User.deleteMany({});
    console.log('Cleared existing users');

    // Create users
    for (const userData of seedUsers) {
      const user = new User(userData);
      try {
        await user.save();
        console.log(`Created user: ${user.email} (${user.role})`);
      } catch (err) {
        console.error(`Failed to save user ${user.email}:`, err.message);
      }
    }

    console.log('\n✅ User seed data created successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('===================');
    seedUsers.forEach(user => {
      console.log(`Email: ${user.email}`);
      console.log(`Password: ${user.password}`);
      console.log(`Role: ${user.role}`);
      console.log('---');
    });

    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

seedDatabase();