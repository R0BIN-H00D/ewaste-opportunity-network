import { createBrowserRouter, Navigate } from 'react-router-dom';
import PublicLayout from '../layouts/PublicLayout';
import DashboardLayout from '../layouts/DashboardLayout';
import Landing from '../pages/public/Landing';
import Browse from '../pages/public/Browse';
import DeviceDetails from '../pages/public/DeviceDetails';
import NotFound from '../pages/NotFound';
import Login from '../pages/auth/Login';
import Register from '../pages/auth/Register';
import ForgotPassword from '../pages/auth/ForgotPassword';
import ResetPassword from '../pages/auth/ResetPassword';
import VerifyEmail from '../pages/auth/VerifyEmail';
import DashboardHome from '../pages/dashboard/DashboardHome';
import Settings from '../pages/dashboard/Settings';
import ListDevice from '../pages/dashboard/ListDevice';
import { AboutPage, HowItWorksPage, PrivacyPage, TermsPage } from '../pages/public/StaticPages';
import Contact from '../pages/public/Contact';
import { LearnArticle, LearnIndex } from '../pages/public/Learn';
import { ImpactPage, ServicesPage } from '../pages/public/Shells';
import Marketplace from '../pages/public/Marketplace';
import ProductDetails from '../pages/public/ProductDetails';
import { TechnicianDirectory, TechnicianProfile } from '../pages/public/Technicians';
import Requests from '../pages/dashboard/Requests';
import NewRequest from '../pages/dashboard/NewRequest';
import RequestDetail from '../pages/dashboard/RequestDetail';
import NotificationsPage from '../pages/dashboard/Notifications';
import Messages from '../pages/dashboard/Messages';
import Transactions from '../pages/dashboard/Transactions';
import Donations from '../pages/public/Donations';
import DonationDetail from '../pages/public/DonationDetail';
import MyDonations from '../pages/dashboard/MyDonations';
import Opportunities from '../pages/dashboard/Opportunities';
import RefurbJobs from '../pages/dashboard/RefurbJobs';
import RefurbJobDetail from '../pages/dashboard/RefurbJobDetail';
import MyProducts from '../pages/dashboard/MyProducts';
import ProductForm from '../pages/dashboard/ProductForm';
import Orders from '../pages/dashboard/Orders';
import OrderDetail from '../pages/dashboard/OrderDetail';
import { RecyclingCenterDetail, RecyclingCenterDirectory } from '../pages/public/RecyclingCenters';
import RecyclingRequests from '../pages/dashboard/RecyclingRequests';
import RecyclingNew from '../pages/dashboard/RecyclingNew';
import RecyclingDetail from '../pages/dashboard/RecyclingDetail';
import RecyclingReport from '../pages/dashboard/RecyclingReport';
import { OpportunityDetail, OpportunityDirectory } from '../pages/public/Opportunities';
import StudentLearning from '../pages/dashboard/StudentLearning';
import ApplicationDetail from '../pages/dashboard/ApplicationDetail';
import LearningTasks from '../pages/dashboard/LearningTasks';
import LearningTaskForm from '../pages/dashboard/LearningTaskForm';
import LearningTaskDetail from '../pages/dashboard/LearningTaskDetail';
import Pickups from '../pages/dashboard/Pickups';
import AdminUsers from '../pages/admin/Users';
import AdminUserDetail from '../pages/admin/UserDetail';
import AdminVerifications from '../pages/admin/Verifications';
import AdminVerificationDetail from '../pages/admin/VerificationDetail';
import AdminMonitors from '../pages/admin/Monitors';
import AdminListings from '../pages/admin/Listings';
import AdminReviews from '../pages/admin/Reviews';
import AdminReports from '../pages/admin/Reports';
import AdminCategories from '../pages/admin/Categories';
import AdminComplaints from '../pages/admin/Complaints';
import AdminComplaintDetail from '../pages/admin/ComplaintDetail';
import AdminAnnouncements from '../pages/admin/Announcements';
import AdminAuditLog from '../pages/admin/AuditLog';
import AdminAnalytics from '../pages/admin/Analytics';
import AdminCertificates from '../pages/admin/Certificates';
import Complaints from '../pages/dashboard/Complaints';
import ComplaintNew from '../pages/dashboard/ComplaintNew';
import ComplaintDetail from '../pages/dashboard/ComplaintDetail';
import RecipientOrg from '../pages/dashboard/RecipientOrg';
import DonationConfirmation from '../pages/dashboard/DonationConfirmation';
import MyListings from '../pages/dashboard/MyListings';
import EditListing from '../pages/dashboard/EditListing';
import { GuestOnly, RequireAuth, RequireRole } from '../components/auth/guards';

const LISTER_ROLES = ['user', 'technician', 'refurbisher']; // matches the API (POST /api/devices)

export const routeConfig = [
  {
    element: <PublicLayout />,
    children: [
      { index: true, element: <Landing /> },
      { path: 'how-it-works', element: <HowItWorksPage /> },
      { path: 'about', element: <AboutPage /> },
      { path: 'privacy', element: <PrivacyPage /> },
      { path: 'terms', element: <TermsPage /> },
      { path: 'contact', element: <Contact /> },
      { path: 'learn', element: <LearnIndex /> },
      { path: 'learn/:slug', element: <LearnArticle /> },
      { path: 'browse', element: <Browse /> },
      { path: 'devices/:id', element: <DeviceDetails /> },
      {
        element: <RequireAuth />,
        children: [{ element: <RequireRole roles={LISTER_ROLES} />, children: [{ path: 'list-device', element: <ListDevice /> }] }],
      },
      { path: 'services', element: <ServicesPage /> },
      { path: 'technicians', element: <TechnicianDirectory /> },
      { path: 'technicians/:id', element: <TechnicianProfile /> },
      { path: 'marketplace', element: <Marketplace /> },
      { path: 'marketplace/:id', element: <ProductDetails /> },
      { path: 'recycling-centers', element: <RecyclingCenterDirectory /> },
      { path: 'recycling-centers/:id', element: <RecyclingCenterDetail /> },
      { path: 'opportunities', element: <OpportunityDirectory /> },
      { path: 'opportunities/:id', element: <OpportunityDetail /> },
      { path: 'donations', element: <Donations /> },
      { path: 'donations/:id', element: <DonationDetail /> },
      { path: 'impact', element: <ImpactPage /> },
      {
        element: <GuestOnly />,
        children: [
          { path: 'login', element: <Login /> },
          { path: 'register', element: <Register /> },
          { path: 'forgot-password', element: <ForgotPassword /> },
        ],
      },
      // Reachable whether or not the person is logged in (links come from emails).
      { path: 'reset-password', element: <ResetPassword /> },
      { path: 'verify-email', element: <VerifyEmail /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          { path: 'dashboard', element: <DashboardHome /> },
          { path: 'dashboard/settings', element: <Settings /> },
          { path: 'dashboard/notifications', element: <NotificationsPage /> },
          { path: 'dashboard/messages', element: <Messages /> },
          { path: 'dashboard/messages/:id', element: <Messages /> },
          { path: 'dashboard/transactions', element: <Transactions /> },
          { path: 'dashboard/requests', element: <Requests /> },
          { path: 'dashboard/requests/:id', element: <RequestDetail /> },
          { path: 'dashboard/donations', element: <MyDonations /> },
          { path: 'dashboard/donations/:id', element: <DonationDetail /> },
          { path: 'dashboard/donations/:id/confirmation', element: <DonationConfirmation /> },
          { path: 'dashboard/refurbishment', element: <RefurbJobs /> },
          { path: 'dashboard/refurbishment/:id', element: <RefurbJobDetail /> },
          { path: 'dashboard/pickups', element: <Pickups /> },
          { path: 'dashboard/orders', element: <Orders /> },
          { path: 'dashboard/orders/:id', element: <OrderDetail /> },
          {
            element: <RequireRole roles={['user', 'technician', 'student', 'refurbisher', 'recycler']} />,
            children: [
              { path: 'dashboard/recycling', element: <RecyclingRequests /> },
              { path: 'dashboard/recycling/new', element: <RecyclingNew /> },
              { path: 'dashboard/recycling/:id', element: <RecyclingDetail /> },
              { path: 'dashboard/complaints', element: <Complaints /> },
              { path: 'dashboard/complaints/new', element: <ComplaintNew /> },
              { path: 'dashboard/complaints/:id', element: <ComplaintDetail /> },
            ],
          },
          {
            element: <RequireRole roles={['admin']} />,
            children: [
              { path: 'dashboard/admin/users', element: <AdminUsers /> },
              { path: 'dashboard/admin/users/:id', element: <AdminUserDetail /> },
              { path: 'dashboard/admin/verifications', element: <AdminVerifications /> },
              { path: 'dashboard/admin/verifications/:userId', element: <AdminVerificationDetail /> },
              { path: 'dashboard/admin/monitors', element: <Navigate to="repairs" replace /> },
              { path: 'dashboard/admin/monitors/:kind', element: <AdminMonitors /> },
              { path: 'dashboard/admin/listings', element: <AdminListings /> },
              { path: 'dashboard/admin/reviews', element: <AdminReviews /> },
              { path: 'dashboard/admin/reports', element: <AdminReports /> },
              { path: 'dashboard/admin/categories', element: <AdminCategories /> },
              { path: 'dashboard/admin/complaints', element: <AdminComplaints /> },
              { path: 'dashboard/admin/complaints/:id', element: <AdminComplaintDetail /> },
              { path: 'dashboard/admin/announcements', element: <AdminAnnouncements /> },
              { path: 'dashboard/admin/audit', element: <AdminAuditLog /> },
              { path: 'dashboard/admin/analytics', element: <AdminAnalytics /> },
              { path: 'dashboard/admin/certificates', element: <AdminCertificates /> },
            ],
          },
          { element: <RequireRole roles={['recycler']} />, children: [{ path: 'dashboard/recycling/report', element: <RecyclingReport /> }] },
          { element: <RequireRole roles={['student']} />, children: [{ path: 'dashboard/learning', element: <StudentLearning /> }] },
          { element: <RequireRole roles={['student', 'technician']} />, children: [{ path: 'dashboard/applications/:id', element: <ApplicationDetail /> }] },
          {
            element: <RequireRole roles={['technician']} />,
            children: [
              { path: 'dashboard/learning-tasks', element: <LearningTasks /> },
              { path: 'dashboard/learning-tasks/new', element: <LearningTaskForm /> },
              { path: 'dashboard/learning-tasks/:id', element: <LearningTaskDetail /> },
              { path: 'dashboard/learning-tasks/:id/edit', element: <LearningTaskForm /> },
            ],
          },
          {
            element: <RequireRole roles={['refurbisher']} />,
            children: [
              { path: 'dashboard/products', element: <MyProducts /> },
              { path: 'dashboard/products/new', element: <ProductForm /> },
              { path: 'dashboard/products/:id/edit', element: <ProductForm /> },
            ],
          },
          { element: <RequireRole roles={['user']} />, children: [{ path: 'dashboard/recipient', element: <RecipientOrg /> }] },
          { element: <RequireRole roles={['refurbisher']} />, children: [{ path: 'dashboard/opportunities', element: <Opportunities /> }] },
          {
            element: <RequireRole roles={LISTER_ROLES} />,
            children: [
              { path: 'dashboard/requests/new', element: <NewRequest /> },
              { path: 'dashboard/listings', element: <MyListings /> },
              { path: 'dashboard/listings/:id/edit', element: <EditListing /> },
            ],
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routeConfig);
