'use strict';
// Shapes learning opportunities and student applications (FR-STU-002..005).
// Opportunities show an area only, never a street address. A supervisor sees a student's college, course and recorded
// hours, never contact details. Students only see their own application and the opportunity.
const { availableActions, applyBlock } = require('../services/workflow/learning');

const idOf = (v) => String(v && v._id ? v._id : v);

const serializeCategory = (c) => (c && c._id ? { _id: c._id, name: c.name, slug: c.slug, icon: c.icon } : c ? { _id: c } : null);

const serializeSupervisor = (u, profile) => ({
  _id: u && u._id ? u._id : u,
  name: u?.name,
  headline: profile?.headline,
  city: profile?.city,
  ratingAvg: profile?.ratingAvg || 0,
  ratingCount: profile?.ratingCount || 0,
});

/**
 * @param o populated opportunity (deviceType, postedBy)
 * @param ctx { seatsTaken, supervisorProfile, counts (supervisor view), myApplication, studentVerified, viewerRole }
 */
function serializeOpportunity(o, ctx = {}) {
  const seatsTaken = ctx.seatsTaken || 0;
  const out = {
    _id: o._id,
    title: o.title,
    description: o.description,
    deviceType: serializeCategory(o.deviceType),
    requiredSkills: o.requiredSkills || [],
    difficulty: o.difficulty,
    locationArea: o.locationArea,
    deadline: o.deadline,
    seats: o.seats,
    seatsTaken,
    seatsLeft: Math.max(o.seats - seatsTaken, 0),
    expectedHours: o.expectedHours ?? null,
    status: o.status,
    supervised: true,
    hazardousExcluded: true,
    supervisor: serializeSupervisor(o.postedBy, ctx.supervisorProfile),
    createdAt: o.createdAt,
    viewerRole: ctx.viewerRole || null,
  };
  if (ctx.viewerRole === 'supervisor' || ctx.viewerRole === 'admin') out.counts = ctx.counts || {};
  if (ctx.viewerRole === 'student') {
    out.myApplication = ctx.myApplication ? { _id: ctx.myApplication._id, status: ctx.myApplication.status } : null;
    out.applyBlock = applyBlock(o, { studentVerified: ctx.studentVerified, existing: ctx.myApplication, seatsTaken });
  }
  return out;
}

const serializeStudent = (u, profile) => ({
  _id: u && u._id ? u._id : u,
  name: u?.name,
  college: profile?.college,
  course: profile?.course,
  yearOfStudy: profile?.yearOfStudy,
  hoursCompleted: profile?.hoursCompleted || 0,
  skills: profile?.skills || [],
});

/**
 * @param a application with `opportunity` populated (deviceType, postedBy) and `student` populated (name)
 * @param ctx { role: 'student'|'supervisor'|'admin', studentProfile, certNo }
 */
function serializeApplication(a, { role, studentProfile, certNo = null } = {}) {
  const opp = a.opportunity || {};
  return {
    _id: a._id,
    status: a.status,
    message: a.message,
    supervisorFeedback: a.supervisorFeedback,
    hours: a.hours || 0,
    startedAt: a.startedAt,
    completedAt: a.completedAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    viewerRole: role,
    actions: role === 'admin' ? [] : availableActions(a, role),
    opportunity: {
      _id: opp._id,
      title: opp.title,
      difficulty: opp.difficulty,
      deadline: opp.deadline,
      locationArea: opp.locationArea,
      status: opp.status,
      requiredSkills: opp.requiredSkills || [],
      deviceType: serializeCategory(opp.deviceType),
      supervisor: opp.postedBy ? { _id: idOf(opp.postedBy), name: opp.postedBy.name } : null,
    },
    student: serializeStudent(a.student, studentProfile),
    certificate: certNo,
    history: (a.history || []).map((h) => ({ status: h.status, at: h.at, note: h.note })),
  };
}

const serializeCertificate = (c, application) => ({
  _id: c._id,
  certNo: c.certNo,
  issuedAt: c.issuedAt,
  application: application
    ? { _id: application._id, hours: application.hours || 0, completedAt: application.completedAt, opportunity: { _id: application.opportunity?._id, title: application.opportunity?.title } }
    : null,
});

module.exports = { serializeOpportunity, serializeApplication, serializeStudent, serializeCertificate, serializeSupervisor };
