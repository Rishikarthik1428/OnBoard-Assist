import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, Button,
  TextField, Select, MenuItem, FormControl,
  InputLabel, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent,
  DialogActions, Alert, Snackbar,
  Chip, IconButton, Tab, Tabs,
  CircularProgress
} from '@mui/material';
import {
  Upload as UploadIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Search as SearchIcon,
  People as PeopleIcon,
  Block as BlockIcon,
  CheckCircle as ActiveIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const AdminPanel = () => {
  const { user: currentUser, isAdmin, isHR } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [users, setUsers] = useState([]);
  const [openUpload, setOpenUpload] = useState(false);
  const [openQA, setOpenQA] = useState(false);
  const [openUserDialog, setOpenUserDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [activeTab, setActiveTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  
  // Upload form state
  const [uploadForm, setUploadForm] = useState({
    title: '',
    category: 'general',
    tags: ''
  });
  
  // QA form state
  const [qaForm, setQaForm] = useState({
    question: '',
    answer: '',
    category: 'general'
  });

  // User form state
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'employee',
    department: '',
    position: '',
    employeeId: ''
  });

  const categories = [
    { value: 'policy', label: 'Company Policy' },
    { value: 'benefits', label: 'Benefits' },
    { value: 'it', label: 'IT Support' },
    { value: 'hr', label: 'HR' },
    { value: 'general', label: 'General' }
  ];

  const roles = [
    { value: 'employee', label: 'Employee' },
    { value: 'hr', label: 'HR' },
    { value: 'admin', label: 'Admin' }
  ];

  // Configure axios with auth token
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  }, []);

  // Fetch documents
  const fetchDocuments = async () => {
    try {
      const response = await axios.get('/admin/documents', {
        params: { search: searchQuery }
      });
      setDocuments(response.data.documents);
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        showSnackbar('You are not authorized to access this page', 'error');
        setTimeout(() => window.location.href = '/', 2000);
      } else {
        showSnackbar('Error fetching documents', 'error');
      }
    }
  };

  // Fetch users
  const fetchUsers = async () => {
    if (!isAdmin && !isHR) return;
    
    try {
      setLoadingUsers(true);
      const response = await axios.get('/auth/users', {
        params: { limit: 1000 }
      });
      setUsers(response.data.users);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
    if (activeTab === 5) {
      fetchUsers();
    }
  }, [searchQuery, activeTab]);

  const handleFileSelect = (event) => {
    setSelectedFile(event.target.files[0]);
    if (!uploadForm.title && event.target.files[0]) {
      setUploadForm(prev => ({
        ...prev,
        title: event.target.files[0].name.replace(/\.[^/.]+$/, "")
      }));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      showSnackbar('Please select a file', 'error');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('document', selectedFile);
    formData.append('title', uploadForm.title);
    formData.append('category', uploadForm.category);
    formData.append('tags', uploadForm.tags);

    try {
      const response = await axios.post('/admin/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      showSnackbar('Document uploaded successfully', 'success');
      setOpenUpload(false);
      setSelectedFile(null);
      setUploadForm({ title: '', category: 'general', tags: '' });
      fetchDocuments();
    } catch (error) {
      showSnackbar('Upload failed: ' + error.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleAddQA = async () => {
    if (!qaForm.question || !qaForm.answer) {
      showSnackbar('Please fill in both question and answer', 'error');
      return;
    }

    try {
      await axios.post('/admin/qa', qaForm);
      showSnackbar('Q&A added successfully', 'success');
      setOpenQA(false);
      setQaForm({ question: '', answer: '', category: 'general' });
      fetchDocuments();
    } catch (error) {
      showSnackbar('Failed to add Q&A', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;

    try {
      await axios.delete(`/admin/documents/${id}`);
      showSnackbar('Document deleted', 'success');
      fetchDocuments();
    } catch (error) {
      showSnackbar('Delete failed', 'error');
    }
  };

  const handleCreateUser = async () => {
    try {
      const response = await axios.post('/auth/register', userForm);
      showSnackbar('User created successfully', 'success');
      setOpenUserDialog(false);
      setUserForm({
        name: '',
        email: '',
        password: '',
        role: 'employee',
        department: '',
        position: '',
        employeeId: ''
      });
      fetchUsers();
    } catch (error) {
      const errorMessage = error.response?.data?.errors 
        ? error.response.data.errors.map(e => e.msg).join(', ')
        : (error.response?.data?.error || 'Failed to create user');
      showSnackbar(errorMessage, 'error');
    }
  };

  const handleEditUser = (user) => {
    setSelectedUser(user);
    setOpenUserDialog(true);
  };

  const handleUpdateUserRole = async () => {
    try {
      await axios.put(`/auth/users/${selectedUser._id}/role`, {
        role: selectedUser.role
      });
      showSnackbar('User role updated', 'success');
      setOpenUserDialog(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      showSnackbar('Failed to update user role', 'error');
    }
  };

  const handleToggleUserStatus = async (user) => {
    if (!window.confirm(`Are you sure you want to ${user.isActive ? 'deactivate' : 'activate'} this user?`)) {
      return;
    }

    try {
      await axios.put(`/auth/users/${user._id}/status`, {
        isActive: !user.isActive
      });
      showSnackbar(`User ${!user.isActive ? 'activated' : 'deactivated'}`, 'success');
      fetchUsers();
    } catch (error) {
      showSnackbar('Failed to update user status', 'error');
    }
  };

  const showSnackbar = (message, severity) => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'admin': return 'error';
      case 'hr': return 'warning';
      case 'employee': return 'success';
      default: return 'default';
    }
  };

  const filteredDocuments = documents.filter(doc => {
    if (activeTab === 0) return true;
    const tabCategories = ['policy', 'benefits', 'it', 'hr'];
    return doc.category === tabCategories[activeTab - 1];
  });

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom>
        Knowledge Base Admin
      </Typography>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <TextField
            placeholder="Search documents..."
            variant="outlined"
            size="small"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'action.active' }} />
            }}
            sx={{ width: 300 }}
          />
          
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              startIcon={<UploadIcon />}
              onClick={() => setOpenUpload(true)}
            >
              Upload Document
            </Button>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setOpenQA(true)}
            >
              Add Q&A
            </Button>
            {(isAdmin || isHR) && (
              <Button
                variant="outlined"
                startIcon={<PeopleIcon />}
                onClick={() => {
                  setSelectedUser(null);
                  setOpenUserDialog(true);
                }}
              >
                Add User
              </Button>
            )}
          </Box>
        </Box>

        <Tabs value={activeTab} onChange={(e, val) => setActiveTab(val)}>
          <Tab label="All Documents" />
          <Tab label="Policies" />
          <Tab label="Benefits" />
          <Tab label="IT Support" />
          <Tab label="HR" />
          {(isAdmin || isHR) && <Tab label="User Management" />}
        </Tabs>
      </Paper>

      {/* Documents Tab */}
      {activeTab < 5 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Title</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Source</TableCell>
                <TableCell>Tags</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredDocuments.map((doc) => (
                <TableRow key={doc._id}>
                  <TableCell>
                    <Typography variant="subtitle2">{doc.title}</Typography>
                    {doc.summary && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {doc.summary.substring(0, 100)}...
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={categories.find(c => c.value === doc.category)?.label || doc.category}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={doc.source}
                      size="small"
                      color={doc.source === 'upload' ? 'secondary' : 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {doc.tags?.slice(0, 3).map((tag, idx) => (
                        <Chip key={idx} label={tag} size="small" />
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell>
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" color="primary">
                      <EditIcon />
                    </IconButton>
                    <IconButton 
                      size="small" 
                      color="error"
                      onClick={() => handleDelete(doc._id)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* User Management Tab */}
      {activeTab === 5 && (isAdmin || isHR) && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
            <Typography variant="h5">
              User Management ({users.length})
            </Typography>
            <Button
              startIcon={<RefreshIcon />}
              onClick={fetchUsers}
              disabled={loadingUsers}
            >
              Refresh
            </Button>
          </Box>

          {loadingUsers ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Department</TableCell>
                    <TableCell>Position</TableCell>
                    <TableCell>Employee ID</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Last Login</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user._id}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {user.name}
                          {user._id === currentUser?._id && (
                            <Chip label="You" size="small" color="info" />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Chip 
                          label={user.role.toUpperCase()}
                          color={getRoleColor(user.role)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{user.department || '-'}</TableCell>
                      <TableCell>{user.position || '-'}</TableCell>
                      <TableCell>{user.employeeId || '-'}</TableCell>
                      <TableCell>
                        <Chip
                          icon={user.isActive ? <ActiveIcon /> : <BlockIcon />}
                          label={user.isActive ? 'Active' : 'Inactive'}
                          color={user.isActive ? 'success' : 'error'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {user.lastLogin 
                          ? new Date(user.lastLogin).toLocaleDateString()
                          : 'Never'
                        }
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={() => handleEditUser(user)}
                          disabled={user._id === currentUser?._id || (isHR && user.role !== 'employee')}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleToggleUserStatus(user)}
                          disabled={user._id === currentUser?._id || (isHR && user.role !== 'employee')}
                        >
                          {user.isActive ? <BlockIcon /> : <ActiveIcon />}
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}

      {/* Upload Dialog */}
      <Dialog open={openUpload} onClose={() => setOpenUpload(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Upload Document</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Button
              variant="outlined"
              component="label"
              startIcon={<UploadIcon />}
            >
              {selectedFile ? selectedFile.name : 'Select File'}
              <input
                type="file"
                hidden
                onChange={handleFileSelect}
                accept=".pdf,.md,.txt,.docx"
              />
            </Button>

            <TextField
              label="Title"
              value={uploadForm.title}
              onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
              fullWidth
            />

            <FormControl fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                value={uploadForm.category}
                label="Category"
                onChange={(e) => setUploadForm({ ...uploadForm, category: e.target.value })}
              >
                {categories.map((cat) => (
                  <MenuItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Tags (comma separated)"
              value={uploadForm.tags}
              onChange={(e) => setUploadForm({ ...uploadForm, tags: e.target.value })}
              fullWidth
              placeholder="policy, benefits, hr"
            />

            <Alert severity="info">
              Supported formats: PDF, Markdown (.md), Text (.txt), Word (.docx)
              Max size: 10MB
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenUpload(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
          >
            {uploading ? <CircularProgress size={24} /> : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Q&A Dialog */}
      <Dialog open={openQA} onClose={() => setOpenQA(false)} maxWidth="md" fullWidth>
        <DialogTitle>Add New Q&A</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Question"
              value={qaForm.question}
              onChange={(e) => setQaForm({ ...qaForm, question: e.target.value })}
              fullWidth
              multiline
              rows={2}
            />

            <TextField
              label="Answer"
              value={qaForm.answer}
              onChange={(e) => setQaForm({ ...qaForm, answer: e.target.value })}
              fullWidth
              multiline
              rows={4}
            />

            <FormControl fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                value={qaForm.category}
                label="Category"
                onChange={(e) => setQaForm({ ...qaForm, category: e.target.value })}
              >
                {categories.map((cat) => (
                  <MenuItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenQA(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddQA}>
            Add Q&A
          </Button>
        </DialogActions>
      </Dialog>

      {/* User Dialog (Create/Edit) */}
      <Dialog open={openUserDialog} onClose={() => setOpenUserDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {selectedUser ? 'Edit User Role' : 'Create New User'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {selectedUser ? (
              <>
                <Typography variant="body1" gutterBottom>
                  <strong>{selectedUser.name}</strong>
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {selectedUser.email}
                </Typography>

                <FormControl fullWidth sx={{ mt: 2 }}>
                  <InputLabel>Role</InputLabel>
                  <Select
                    value={selectedUser.role}
                    label="Role"
                    onChange={(e) => setSelectedUser({
                      ...selectedUser,
                      role: e.target.value
                    })}
                  >
                    {roles.map((role) => (
                      <MenuItem key={role.value} value={role.value}>
                        {role.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {selectedUser._id === currentUser?._id && (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    You cannot change your own role
                  </Alert>
                )}
              </>
            ) : (
              <>
                <TextField
                  label="Full Name"
                  value={userForm.name}
                  onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  fullWidth
                  required
                />

                <TextField
                  label="Email"
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  fullWidth
                  required
                />

                <TextField
                  label="Password"
                  type="password"
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  fullWidth
                  required
                  helperText="Min 6 chars, 1 uppercase, 1 lowercase, 1 number"
                />

                <FormControl fullWidth>
                  <InputLabel>Role</InputLabel>
                  <Select
                    value={userForm.role}
                    label="Role"
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  >
                    {roles.map((role) => (
                      <MenuItem key={role.value} value={role.value}>
                        {role.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  label="Department"
                  value={userForm.department}
                  onChange={(e) => setUserForm({ ...userForm, department: e.target.value })}
                  fullWidth
                />

                <TextField
                  label="Position"
                  value={userForm.position}
                  onChange={(e) => setUserForm({ ...userForm, position: e.target.value })}
                  fullWidth
                />

                <TextField
                  label="Employee ID"
                  value={userForm.employeeId}
                  onChange={(e) => setUserForm({ ...userForm, employeeId: e.target.value })}
                  fullWidth
                />
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenUserDialog(false)}>Cancel</Button>
          <Button 
            onClick={selectedUser ? handleUpdateUserRole : handleCreateUser}
            variant="contained"
            disabled={selectedUser?._id === currentUser?._id}
          >
            {selectedUser ? 'Update Role' : 'Create User'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleCloseSnackbar} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default AdminPanel;