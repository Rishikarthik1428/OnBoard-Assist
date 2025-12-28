import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { CircularProgress, Box } from '@mui/material';

const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        gap: 2
      }}>
        <CircularProgress size={60} />
        <Box>Loading authentication...</Box>
      </Box>
    );
  }

  if (!user) {
    // Redirect to login, but save the location they were trying to go to
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        gap: 2
      }}>
        <Box sx={{ fontSize: 24, fontWeight: 'bold', color: 'error.main' }}>
          ⚠️ Access Denied
        </Box>
        <Box sx={{ color: 'text.secondary' }}>
          You don't have permission to access this page.
        </Box>
        <Box 
          component="a" 
          href="/"
          sx={{ 
            mt: 2, 
            color: 'primary.main',
            textDecoration: 'none',
            '&:hover': { textDecoration: 'underline' }
          }}
        >
          Return to Home
        </Box>
      </Box>
    );
  }

  return children;
};

export default ProtectedRoute;