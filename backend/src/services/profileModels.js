'use strict';
const { ROLES } = require('../config/constants');
const TechnicianProfile = require('../models/TechnicianProfile');
const StudentProfile = require('../models/StudentProfile');
const RefurbisherProfile = require('../models/RefurbisherProfile');
const RecyclingCenter = require('../models/RecyclingCenter');

// Provider roles each have one role-specific document (1:1 with User) holding their verification state.
const ROLE_PROFILE_MODEL = {
  [ROLES.TECHNICIAN]: TechnicianProfile,
  [ROLES.STUDENT]: StudentProfile,
  [ROLES.REFURBISHER]: RefurbisherProfile,
  [ROLES.RECYCLER]: RecyclingCenter,
};

const createRoleProfile = (user, { organizationName } = {}) => {
  switch (user.role) {
    case ROLES.TECHNICIAN: return TechnicianProfile.create({ user: user._id });
    case ROLES.STUDENT: return StudentProfile.create({ user: user._id });
    case ROLES.REFURBISHER: return RefurbisherProfile.create({ user: user._id, businessName: organizationName });
    case ROLES.RECYCLER: return RecyclingCenter.create({ user: user._id, name: organizationName });
    default: return null;
  }
};

module.exports = { ROLE_PROFILE_MODEL, createRoleProfile };
