import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Avatar,
  Menu,
  MenuItem,
  IconButton,
  Chip,
  Tooltip
} from '@mui/material';
import {
  SmartToy as ChatIcon,
  Settings as AdminIcon,
  Person as UserIcon,
  ExitToApp as LogoutIcon,
  ArrowDropDown as ArrowDropDownIcon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';

const Navbar = () => {
  const { user, logout, isAdmin, isHR } = useAuth();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState(null);

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    handleMenuClose();
    await logout();
    navigate('/login');
  };

  const handleProfile = () => {
    handleMenuClose();
    // TODO: Navigate to profile page
    console.log('Profile clicked');
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'admin': return 'error';
      case 'hr': return 'warning';
      case 'employee': return 'success';
      default: return 'default';
    }
  };

  return (
    <AppBar position="static">
      <Toolbar>
        <ChatIcon sx={{ mr: 2 }} />
        
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Employee Onboarding Assistant
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {user && (
            <>
              <Button 
                color="inherit" 
                component={Link} 
                to="/"
                startIcon={<ChatIcon />}
              >
                Chat
              </Button>
              
              {(isAdmin || isHR) && (
                <Button 
                  color="inherit" 
                  component={Link} 
                  to="/admin"
                  startIcon={<AdminIcon />}
                >
                  Admin Panel
                </Button>
              )}

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Tooltip title={user.name}>
                  <Avatar sx={{ bgcolor: 'secondary.main' }}>
                    {user.name.charAt(0).toUpperCase()}
                  </Avatar>
                </Tooltip>
                
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="body2" sx={{ lineHeight: 1 }}>
                    {user.name}
                  </Typography>
                  <Chip 
                    label={user.role.toUpperCase()}
                    size="small"
                    color={getRoleColor(user.role)}
                    sx={{ height: 20, fontSize: '0.65rem' }}
                  />
                </Box>

                <IconButton
                  color="inherit"
                  onClick={handleMenuOpen}
                  size="small"
                >
                  <ArrowDropDownIcon />
                </IconButton>

                <Menu
                  anchorEl={anchorEl}
                  open={Boolean(anchorEl)}
                  onClose={handleMenuClose}
                >
                  <MenuItem onClick={handleProfile}>
                    <UserIcon sx={{ mr: 1 }} fontSize="small" />
                    Profile
                  </MenuItem>
                  <MenuItem onClick={handleLogout}>
                    <LogoutIcon sx={{ mr: 1 }} fontSize="small" />
                    Logout
                  </MenuItem>
                </Menu>
              </Box>
            </>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;