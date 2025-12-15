
import React, { useState, useEffect, useContext } from 'react';
import {
  Container, Typography, Grid, Card, CardContent, Button,
  Select, MenuItem, FormControl, InputLabel, Alert, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, TextField,
  Box, Avatar, Chip, IconButton, Divider, Badge,
  Tabs, Tab, AppBar, InputAdornment, Toolbar, Drawer, List,
  ListItem, ListItemIcon, ListItemText,
  Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  ShoppingCart as ShoppingCartIcon,
  Download as DownloadIcon,
  Visibility as VisibilityIcon,
  CheckCircle as CheckCircleIcon,
  CreditCard as CreditCardIcon,
  TrendingUp as TrendingUpIcon,
  DataUsage as DataUsageIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Menu as MenuIcon,
  Logout as LogoutIcon,
  Add as AddIcon,
  AccountBalanceWallet as WalletIcon,
  Assignment as AssignmentIcon,
  GetApp as GetAppIcon,
  Refresh as RefreshIcon,
  Person as PersonIcon,
  Edit as EditIcon
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { AuthContext } from '../context/AuthContext';
import { dataAPI, purchaseAPI, userAPI } from '../services/api';
import { useToast } from '../context/ToastContext';

const UserDashboard = () => {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [preview, setPreview] = useState([]);
  const [requests, setRequests] = useState([]);
  const [purchased, setPurchased] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentView, setCurrentView] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [searchTypeRequests, setSearchTypeRequests] = useState('category');
  const [searchTypePurchased, setSearchTypePurchased] = useState('category');
  const [activeTab, setActiveTab] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profile, setProfile] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState({ startDate: '', endDate: '' });

  const [dailyQuantity, setDailyQuantity] = useState(0);
  const [weekDialogOpen, setWeekDialogOpen] = useState(false);
  // Generate next 6 weeks' Monday-Friday ranges
  const [selectedCategoryForWeek, setSelectedCategoryForWeek] = useState('');
  const [reorderDialogOpen, setReorderDialogOpen] = useState(false);
  const [completedDeliveries, setCompletedDeliveries] = useState([]);
  const [dailyQuantities, setDailyQuantities] = useState({ mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 });
  const [hasShownReorderDialog, setHasShownReorderDialog] = useState(false);
  const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false);
  const [selectedWeekOption, setSelectedWeekOption] = useState('');
  const { user, logout } = useContext(AuthContext);
  const { showToast } = useToast();
  const generateWeekOptions = () => {
    const options = [];
    const today = new Date();
    let currentMonday = new Date(today);

    // Find the next Monday
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7;
    currentMonday.setDate(today.getDate() + daysUntilMonday);

    for (let i = 0; i < 6; i++) {
      const monday = new Date(currentMonday);
      monday.setDate(currentMonday.getDate() + (i * 7));

      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);

      const mondayStr = monday.toISOString().split('T')[0];
      const fridayStr = friday.toISOString().split('T')[0];

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const mondayDate = monday.getDate();
      const fridayDate = friday.getDate();
      const month = monthNames[monday.getMonth()];
      const year = monday.getFullYear();

      const label = `${month} ${mondayDate}-${fridayDate}, ${year}`;

      options.push({
        label,
        startDate: mondayStr,
        endDate: fridayStr,
        value: `${mondayStr}_${fridayStr}`
      });
    }

    return options;
  };

  const weekOptions = generateWeekOptions();

  useEffect(() => {
    loadCategories();
    loadRequests();
    loadPurchased();
    loadProfile();
    loadDailyRequirements();
    checkForReorderNotification();
  }, []);

  const loadDailyRequirements = async (startDate, endDate) => {
    try {
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const res = await dataAPI.getDailyRequirements(Object.keys(params).length ? params : undefined);
      setDailyRequirementsState(res.data.requirements || {});
      setDailyRequirementsDates(res.data.dates || {});
    } catch (err) {
      // not fatal for users
    }
  };

  // When user selects a week, refresh daily requirements for that range
  useEffect(() => {
    if (selectedWeek.startDate && selectedWeek.endDate) {
      loadDailyRequirements(selectedWeek.startDate, selectedWeek.endDate);
    }
  }, [selectedWeek]);

  const [dailyRequirementsState, setDailyRequirementsState] = useState({});
  const [dailyRequirementsDates, setDailyRequirementsDates] = useState({});
  const [downloadedButtons, setDownloadedButtons] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('downloadedButtons') || '{}');
    } catch (e) {
      return {};
    }
  });
  const [requestDayAvailability, setRequestDayAvailability] = useState({});

  const loadCategories = async () => {
    try {
      const response = await dataAPI.getCategories();
      // Normalize categories to a consistent shape: { id, name, count }
      const cats = (response.data || []).map(c => ({
        id: c.id || c._id || null,
        name: c.name || c._id || c.category || String(c),
        count: c.count || 0
      }));
      setCategories(cats);
      //
    } catch (err) {
      showToast('Failed to load categories', 'error');
    }
  };

  const loadRequests = async () => {
    try {
      const response = await purchaseAPI.getRequests();
      setRequests(response.data);
      // After loading requests, pre-fetch availability for each request's delivery days
      fetchRequestsAvailability(response.data);
    } catch (err) {
      showToast('Failed to load requests', 'error');
    }
  };

  // Prefetch whether uploaded data exists for each request/day so buttons can be enabled
  const fetchRequestsAvailability = async (requestsList) => {
    if (!Array.isArray(requestsList)) return;
    const next = { ...requestDayAvailability };

    const promises = [];
    requestsList.forEach((req) => {
      if (req.status !== 'approved' || !req.weekRange) return;
      ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach((day, idx) => {
        const qty = req.dailyQuantities?.[day] || 0;
        if (!qty) return;
        const key = `${req._id}-${day}`;

        // compute ISO date for this day based on request.weekRange.startDate
        try {
          const start = new Date(req.weekRange.startDate);
          const target = new Date(start);
          target.setDate(start.getDate() + idx);
          const iso = target.toISOString().split('T')[0];

          // push a promise to probe the endpoint. We won't fail the whole flow on error.
          const p = dataAPI.getDailyUploadedData(req.category, day, iso)
            .then(() => { next[key] = true; })
            .catch(() => { next[key] = false; });
          promises.push(p);
        } catch (e) {
          next[key] = false;
        }
      });
    });

    try {
      await Promise.all(promises);
    } catch (e) {
      // ignore - individual promises set availability
    }
  };

  const loadPurchased = async () => {
    try {
      const response = await purchaseAPI.getPurchased();
      setPurchased(response.data);
    } catch (err) {
      showToast('Failed to load purchased data', 'error');
    }
  };

  const loadProfile = async () => {
    try {
      const response = await userAPI.getProfile();
      const userData = response.data;
      setProfile({
        email: userData.email || '',
        firstName: userData.profile?.firstName || '',
        lastName: userData.profile?.lastName || '',
        company: userData.profile?.company || '',
        phone: userData.profile?.phone || '',
        address: {
          street: userData.profile?.address?.street || '',
          city: userData.profile?.address?.city || '',
          state: userData.profile?.address?.state || '',
          zipCode: userData.profile?.address?.zipCode || '',
          country: userData.profile?.address?.country || ''
        }
      });
    } catch (err) {
      showToast('Failed to load profile', 'error');
    }
  };

  const getPreviousFriday = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysSinceFriday = (dayOfWeek + 2) % 7; // Calculate days back to previous Friday
    const previousFriday = new Date(today);
    previousFriday.setDate(today.getDate() - daysSinceFriday);
    previousFriday.setHours(0, 0, 0, 0);
    return previousFriday;
  };

  const checkForReorderNotification = () => {
    // Simple check: if there are purchased items and today is after Friday, show reorder dialog
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday
    if (purchased.length > 0 && dayOfWeek >= 1 && dayOfWeek <= 5 && !hasShownReorderDialog) {
      // Assuming weekly deliveries, check if it's time for reorder
      // For simplicity, show if there are purchases and it's a weekday
      setReorderDialogOpen(true);
      setHasShownReorderDialog(true);
    }
  };



  const handleSaveProfile = async () => {
    try {
      const profileData = {};
      if (profile.firstName) profileData.firstName = profile.firstName;
      if (profile.lastName) profileData.lastName = profile.lastName;
      if (profile.company) profileData.company = profile.company;
      if (profile.phone) profileData.phone = profile.phone;

      const address = {};
      if (profile.address?.street) address.street = profile.address.street;
      if (profile.address?.city) address.city = profile.address.city;
      if (profile.address?.state) address.state = profile.address.state;
      if (profile.address?.zipCode) address.zipCode = profile.address.zipCode;
      if (profile.address?.country) address.country = profile.address.country;

      if (Object.keys(address).length > 0) {
        profileData.address = address;
      }

      await userAPI.updateProfile({ profile: profileData, email: profile.email });
      showToast('Profile updated successfully', 'success');
      setIsEditing(false);
      loadProfile(); // Reload profile to reflect changes
    } catch (err) {
      showToast('Failed to update profile', 'error');
    }
  };

  const handleCategoryChange = async (category) => {
    setSelectedCategory(category);
    try {
      const response = await dataAPI.getPreview(category);
      setPreview(response.data);
    } catch (err) {
      showToast('Failed to load preview', 'error');
    }
  };

  const handlePurchaseRequest = async () => {
    if (!selectedCategory) {
      showToast('Please select a category', 'error');
      return;
    }

    try {
      const res = await purchaseAPI.createRequest({ category: selectedCategory, quantity });
      const available = res.data?.availableCount;
      if (available === 0) {
        showToast('Purchase request submitted and queued — admin has not uploaded data yet', 'success');
      } else {
        showToast('Purchase request submitted successfully', 'success');
      }
      loadRequests();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to submit request', 'error');
    }
  };

  const handlePayment = async (requestId) => {
    try {
      // Directly mark payment as successful (skip payment gateway for now)
      await purchaseAPI.confirmPayment({
        requestId: requestId,
        paymentId: `demo_${Date.now()}`, // Demo payment ID
        signature: 'demo_signature', // Demo signature
      });
      showToast('Payment successful! Data has been added to your account.', 'success');
      loadRequests();
      loadPurchased();
    } catch (err) {
      setError('Payment processing failed');
    }
  };

  const handleWeeklyPurchaseRequest = async () => {
    if (!selectedCategoryForWeek || !selectedWeek.startDate || !selectedWeek.endDate) {
      setError('Please select a category and week range');
      return;
    }

    const totalQuantity = Object.values(dailyQuantities).reduce((sum, qty) => sum + qty, 0);
    if (totalQuantity === 0) {
      setError('Please specify quantities for at least one day');
      return;
    }

    try {
      const res = await purchaseAPI.createRequest({
        category: selectedCategoryForWeek,
        quantity: totalQuantity,
        weekRange: {
          startDate: selectedWeek.startDate,
          endDate: selectedWeek.endDate
        },
        dailyQuantities: {
          monday: dailyQuantities.mon,
          tuesday: dailyQuantities.tue,
          wednesday: dailyQuantities.wed,
          thursday: dailyQuantities.thu,
          friday: dailyQuantities.fri
        }
      });
      const available = res.data?.availableCount;
      if (available === 0) {
        showToast('Weekly purchase request submitted and queued — admin has not uploaded data yet', 'success');
      } else {
        showToast('Weekly purchase request submitted successfully', 'success');
      }
      loadRequests();
      // Reset form
      setSelectedWeek({ startDate: '', endDate: '' });
      setDailyQuantities({ mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 });
      setSelectedCategoryForWeek('');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to submit weekly request', 'error');
    }
  };

  const handleDownloadData = (purchase) => {
    // Prepare data for Excel export - use original metadata format
    const data = purchase.dataItems.map(item => ({
      ...item.metadata, // Spread original row data
      Index: item.index
    }));

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(data);

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Purchased Data');

    // Generate Excel file and download
    XLSX.writeFile(wb, `purchased_data_${purchase._id.slice(-6)}.xlsx`);
  };

  // Filter functions
  const filteredRequests = requests.filter(req => {
    const matchesSearch = req.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || req.status === statusFilter;
    const matchesDate = dateFilter === 'all' || (() => {
      const reqDate = new Date(req.createdAt);
      const now = new Date();
      const diffTime = Math.abs(now - reqDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (dateFilter === 'today') return diffDays <= 1;
      if (dateFilter === 'week') return diffDays <= 7;
      if (dateFilter === 'month') return diffDays <= 30;
      return true;
    })();
    return matchesSearch && matchesStatus && matchesDate;
  });

  const filteredPurchased = purchased.filter(purchase => {
    const matchesSearch = purchase.dataItems.some(item =>
      item.category && item.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const matchesDate = dateFilter === 'all' || (() => {
      const purchaseDate = new Date(purchase.purchasedAt);
      const now = new Date();
      const diffTime = Math.abs(now - purchaseDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (dateFilter === 'today') return diffDays <= 1;
      if (dateFilter === 'week') return diffDays <= 7;
      if (dateFilter === 'month') return diffDays <= 30;
      return true;
    })();
    return matchesSearch && matchesDate;
  });

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setDateFilter('all');
    setSearchTypeRequests('category');
    setSearchTypePurchased('category');
  };

  const toggleDrawer = () => {
    setDrawerOpen(!drawerOpen);
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleDrawerItemClick = (view) => {
    setCurrentView(view);
    setDrawerOpen(false);
    if (view === 'logout') {
      logout();
    } else if (view === 'dashboard') {
      setActiveTab(0);
    } else if (view === 'request-purchase') {
      setActiveTab(1);
    } else if (view === 'data-preview') {
      setActiveTab(1);
    } else if (view === 'purchase-requests') {
      setActiveTab(2);
    } else if (view === 'purchased-data') {
      setActiveTab(3);
    } else if (view === 'profile') {
      setActiveTab(4);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8f9fa', py: 4 }}>
      <AppBar position="static" sx={{ bgcolor: 'primary.main', mb: 4 }}>
        <Toolbar>
          <IconButton
            edge="start"
            color="inherit"
            aria-label="menu"
            onClick={toggleDrawer}
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <Tabs
              value={activeTab}
              onChange={handleTabChange}
              indicatorColor="secondary"
              textColor="inherit"
              variant="fullWidth"
              sx={{ minHeight: 64 }}
            >
              <Tab
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <DashboardIcon sx={{ mr: 1 }} />
                    Dashboard
                  </Box>
                }
                sx={{ minHeight: 64 }}
              />
              <Tab
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <ShoppingCartIcon sx={{ mr: 1 }} />
                    Request Data Purchase
                  </Box>
                }
                sx={{ minHeight: 64 }}
              />
              <Tab
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <CreditCardIcon sx={{ mr: 1 }} />
                    Purchase Requests ({filteredRequests.length})
                  </Box>
                }
                sx={{ minHeight: 64 }}
              />
              <Tab
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <DownloadIcon sx={{ mr: 1 }} />
                    Purchased Data ({filteredPurchased.length})
                  </Box>
                }
                sx={{ minHeight: 64 }}
              />
              <Tab
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <PersonIcon sx={{ mr: 1 }} />
                    Profile
                  </Box>
                }
                sx={{ minHeight: 64 }}
              />
            </Tabs>
          </Box>
          <Typography variant="body1" sx={{ mr: 2 }}>
            Welcome, {user?.email}
          </Typography>
        </Toolbar>
      </AppBar>

      {/* Drawer */}
      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={toggleDrawer}
        sx={{
          '& .MuiDrawer-paper': {
            width: 250,
            bgcolor: 'primary.main',
            color: 'white'
          }
        }}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Navigation
          </Typography>
          <List>
            <ListItem button onClick={() => handleDrawerItemClick('dashboard')}>
              <ListItemIcon sx={{ color: 'white' }}>
                <DashboardIcon />
              </ListItemIcon>
              <ListItemText primary="Dashboard" />
            </ListItem>
            <ListItem button onClick={() => handleDrawerItemClick('request-purchase')}>
              <ListItemIcon sx={{ color: 'white' }}>
                <ShoppingCartIcon />
              </ListItemIcon>
              <ListItemText primary="Request Data Purchase" />
            </ListItem>
            <ListItem button onClick={() => handleDrawerItemClick('data-preview')}>
              <ListItemIcon sx={{ color: 'white' }}>
                <VisibilityIcon />
              </ListItemIcon>
              <ListItemText primary="Data Preview" />
            </ListItem>
            <ListItem button onClick={() => handleDrawerItemClick('purchase-requests')}>
              <ListItemIcon sx={{ color: 'white' }}>
                <CreditCardIcon />
              </ListItemIcon>
              <ListItemText primary="Purchase Requests" />
            </ListItem>
            <ListItem button onClick={() => handleDrawerItemClick('purchased-data')}>
              <ListItemIcon sx={{ color: 'white' }}>
                <DownloadIcon />
              </ListItemIcon>
              <ListItemText primary="Purchased Data" />
            </ListItem>
            <ListItem button onClick={() => handleDrawerItemClick('profile')}>
              <ListItemIcon sx={{ color: 'white' }}>
                <PersonIcon />
              </ListItemIcon>
              <ListItemText primary="Profile" />
            </ListItem>
            <Divider sx={{ bgcolor: 'rgba(255,255,255,0.3)', my: 2 }} />
            <ListItem button onClick={() => handleDrawerItemClick('logout')}>
              <ListItemIcon sx={{ color: 'white' }}>
                <LogoutIcon />
              </ListItemIcon>
              <ListItemText primary="Logout" />
            </ListItem>
          </List>
        </Box>
      </Drawer>

      <Container maxWidth="xl">

        {/* Feedback is shown via toasts (ToastContext) instead of inline Alerts */}

        {/* Tabbed Section */}
        <Card sx={{
          borderRadius: 3,
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          background: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%)'
        }}>

              {/* Filter Section */}
              {(activeTab === 2 || activeTab === 3) && (
                <CardContent sx={{ p: 3, borderBottom: '1px solid #e0e0e0' }}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                    <TextField
                      size="small"
                      placeholder="Search by category..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon />
                          </InputAdornment>
                        ),
                      }}
                      sx={{ minWidth: 200 }}
                    />

                    {activeTab === 2 && (
                      <FormControl size="small" sx={{ minWidth: 120 }}>
                        <InputLabel>Status</InputLabel>
                        <Select
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value)}
                          label="Status"
                        >
                          <MenuItem value="all">All Status</MenuItem>
                          <MenuItem value="pending">Pending</MenuItem>
                          <MenuItem value="approved">Approved</MenuItem>
                          <MenuItem value="rejected">Rejected</MenuItem>
                        </Select>
                      </FormControl>
                    )}

                    <FormControl size="small" sx={{ minWidth: 120 }}>
                      <InputLabel>Date</InputLabel>
                      <Select
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                        label="Date"
                      >
                        <MenuItem value="all">All Time</MenuItem>
                        <MenuItem value="today">Today</MenuItem>
                        <MenuItem value="week">This Week</MenuItem>
                        <MenuItem value="month">This Month</MenuItem>
                      </Select>
                    </FormControl>

                    <Button
                      variant="outlined"
                      size="small"
                      onClick={clearFilters}
                      startIcon={<ClearIcon />}
                      sx={{ borderRadius: 2 }}
                    >
                      Clear Filters
                    </Button>
                  </Box>
                </CardContent>
              )}

              {/* Dashboard Tab */}
              {activeTab === 0 && <Box sx={{ p: 3 }}>
                  <Typography variant="h4" sx={{ mb: 4, fontWeight: 'bold', color: 'primary.main' }}>
                    Welcome to DataMartX
                  </Typography>

                  <Grid container spacing={3}>
                    {/* Stats Cards */}
                    <Grid item xs={12} md={4}>
                      <Card sx={{
                        borderRadius: 3,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: 'white'
                      }}>
                        <CardContent sx={{ p: 3 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Box>
                              <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                                {requests.length}
                              </Typography>
                              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                                Total Requests
                              </Typography>
                            </Box>
                            <AssignmentIcon sx={{ fontSize: '3rem', opacity: 0.7 }} />
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>

                    <Grid item xs={12} md={4}>
                      <Card sx={{
                        borderRadius: 3,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                        background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                        color: 'white'
                      }}>
                        <CardContent sx={{ p: 3 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Box>
                              <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                                {purchased.length}
                              </Typography>
                              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                                Purchased Data
                              </Typography>
                            </Box>
                            <GetAppIcon sx={{ fontSize: '3rem', opacity: 0.7 }} />
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>

                    <Grid item xs={12} md={4}>
                      <Card sx={{
                        borderRadius: 3,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                        background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                        color: 'white'
                      }}>
                        <CardContent sx={{ p: 3 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Box>
                              <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                                {purchased.reduce((sum, p) => sum + p.dataItems.length, 0)}
                              </Typography>
                              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                                Total Items Purchased
                              </Typography>
                            </Box>
                            <WalletIcon sx={{ fontSize: '3rem', opacity: 0.7 }} />
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>

                    {/* Quick Actions */}
                    <Grid item xs={12}>
                      <Card sx={{
                        borderRadius: 3,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                        background: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%)'
                      }}>
                        <CardContent sx={{ p: 3 }}>
                          <Typography variant="h6" sx={{ mb: 3, fontWeight: 'bold' }}>
                            Quick Actions
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                            <Button
                              variant="contained"
                              size="large"
                              onClick={() => setActiveTab(1)}
                              sx={{
                                borderRadius: 2,
                                background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
                                '&:hover': {
                                  background: 'linear-gradient(45deg, #1976D2 30%, #00BCD4 90%)',
                                }
                              }}
                              startIcon={<AddIcon />}
                              title="Navigate to request data purchase tab"
                            >
                              Request Data Purchase
                            </Button>
                            <Button
                              variant="outlined"
                              size="large"
                              onClick={() => setActiveTab(2)}
                              sx={{ borderRadius: 2 }}
                              startIcon={<AssignmentIcon />}
                              title="Navigate to purchase requests tab"
                            >
                              View Requests
                            </Button>
                            <Button
                              variant="outlined"
                              size="large"
                              onClick={() => setActiveTab(3)}
                              sx={{ borderRadius: 2 }}
                              startIcon={<GetAppIcon />}
                              title="Navigate to purchased data tab"
                            >
                              View Purchased Data
                            </Button>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>
                </Box>
                }

                {/* Request Data Purchase Tab */}
                {activeTab === 1 && <Box sx={{ p: 3 }}>
                  <Typography variant="h5" sx={{ mb: 4, fontWeight: 'bold', color: 'primary.main' }}>
                    Request Weekly Data Purchase
                  </Typography>

                  <Typography variant="body1" sx={{ mb: 4, color: 'text.secondary' }}>
                    Select a data category below to request weekly deliveries (Monday-Friday). You'll specify quantities for each day of the week.
                  </Typography>

                  <Grid container spacing={3}>
                    {categories.map((category) => (
                      <Grid item xs={12} sm={6} md={3} key={category.id || category._id || category.name}>
                        <Card sx={{
                          borderRadius: 3,
                          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                          background: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%)',
                          cursor: 'pointer',
                          transition: 'transform 0.2s, box-shadow 0.2s',
                          '&:hover': {
                            transform: 'translateY(-4px)',
                            boxShadow: '0 8px 30px rgba(0,0,0,0.15)'
                          }
                        }} onClick={() => {
                          setSelectedCategoryForWeek(category.name);
                          setWeekDialogOpen(true);
                        }}>
                          <CardContent sx={{ p: 3, textAlign: 'center' }}>
                            <DataUsageIcon sx={{ fontSize: '3rem', color: 'primary.main', mb: 2 }} />
                            <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1 }}>
                              {category.name}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                              Weekly data delivery
                            </Typography>
                            {/* Day buttons removed from category card to declutter UI; kept in Purchase Requests view */}
                            <Button
                              variant="contained"
                              fullWidth
                              sx={{
                                borderRadius: 2,
                                background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
                                '&:hover': {
                                  background: 'linear-gradient(45deg, #1976D2 30%, #00BCD4 90%)',
                                }
                              }}
                              startIcon={<ShoppingCartIcon />}
                            >
                              Order Now
                            </Button>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>

                  {/* Week Selection Dialog */}
                  <Dialog
                    open={weekDialogOpen}
                    onClose={() => setWeekDialogOpen(false)}
                    maxWidth="md"
                    fullWidth
                  >
                    <DialogTitle sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                      Select Week Range & Daily Quantities
                    </DialogTitle>
                    <DialogContent>
                      <Typography variant="body1" sx={{ mb: 3 }}>
                        Choose a week for data delivery and specify quantities for each weekday.
                      </Typography>

                      <Grid container spacing={3}>
                        <Grid item xs={12} md={6}>
                          <FormControl fullWidth sx={{ mb: 3 }}>
                            <InputLabel>Select Week</InputLabel>
                            <Select
                              value={selectedWeekOption}
                              onChange={(e) => {
                                const selectedOption = weekOptions.find(option => option.value === e.target.value);
                                if (selectedOption) {
                                  setSelectedWeekOption(e.target.value);
                                  setSelectedWeek({
                                    startDate: selectedOption.startDate,
                                    endDate: selectedOption.endDate
                                  });
                                }
                              }}
                              label="Select Week"
                            >
                              {weekOptions.map((option) => (
                                <MenuItem key={option.value} value={option.value}>
                                  {option.label}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                          <TextField
                            fullWidth
                            label="Week Start Date (Monday)"
                            type="date"
                            value={selectedWeek.startDate}
                            InputProps={{ readOnly: true }}
                            InputLabelProps={{ shrink: true }}
                            sx={{ mb: 3 }}
                          />
                          <TextField
                            fullWidth
                            label="Week End Date (Friday)"
                            type="date"
                            value={selectedWeek.endDate}
                            InputProps={{ readOnly: true }}
                            InputLabelProps={{ shrink: true }}
                            sx={{ mb: 3 }}
                          />
                        </Grid>

                        <Grid item xs={12} md={6}>
                          <Typography variant="h6" sx={{ mb: 2, fontWeight: 'bold' }}>
                            Daily Quantity
                          </Typography>
                          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                            Enter the quantity you want for each day (Monday-Friday)
                          </Typography>
                          <TextField
                            fullWidth
                            label="Quantity per day"
                            type="number"
                            value={dailyQuantity}
                            onChange={(e) => setDailyQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                            InputProps={{ inputProps: { min: 0 } }}
                            sx={{ mb: 2 }}
                          />
                          <Typography variant="body2" color="text.secondary">
                            This quantity will be applied to all weekdays (Mon-Fri)
                          </Typography>
                        </Grid>
                      </Grid>
                    </DialogContent>
                    <DialogActions>
                      <Button onClick={() => setWeekDialogOpen(false)} sx={{ borderRadius: 2 }}>
                        Cancel
                      </Button>
                      <Button
                        variant="contained"
                        onClick={() => {
                          setDailyQuantities({
                            mon: dailyQuantity,
                            tue: dailyQuantity,
                            wed: dailyQuantity,
                            thu: dailyQuantity,
                            fri: dailyQuantity
                          });
                          setWeekDialogOpen(false);
                          setConfirmationDialogOpen(true);
                        }}
                        disabled={!selectedWeek.startDate || dailyQuantity === 0}
                        sx={{
                          borderRadius: 2,
                          background: 'linear-gradient(45deg, #4CAF50 30%, #81C784 90%)',
                          '&:hover': {
                            background: 'linear-gradient(45deg, #388E3C 30%, #66BB6A 90%)',
                          }
                        }}
                      >
                        Review Order
                      </Button>
                    </DialogActions>
                  </Dialog>

                  {/* Order Confirmation Dialog */}
                  <Dialog
                    open={confirmationDialogOpen}
                    onClose={() => setConfirmationDialogOpen(false)}
                    maxWidth="md"
                    fullWidth
                  >
                    <DialogTitle sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                      Confirm Weekly Data Order
                    </DialogTitle>
                    <DialogContent>
                          <Typography variant="h6" sx={{ mb: 2 }}>
                        Category: {categories.find(c => c.name === selectedCategoryForWeek)?.name || 'Unknown'}
                      </Typography>
                      <Typography variant="body1" sx={{ mb: 3 }}>
                        Week: {selectedWeek.startDate} to {selectedWeek.endDate}
                      </Typography>

                      <TableContainer component={Paper} sx={{ mb: 3 }}>
                        <Table>
                          <TableHead sx={{ bgcolor: 'primary.main' }}>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Day</TableCell>
                              <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Quantity</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {[
                              { key: 'mon', label: 'Monday', qty: dailyQuantities.mon },
                              { key: 'tue', label: 'Tuesday', qty: dailyQuantities.tue },
                              { key: 'wed', label: 'Wednesday', qty: dailyQuantities.wed },
                              { key: 'thu', label: 'Thursday', qty: dailyQuantities.thu },
                              { key: 'fri', label: 'Friday', qty: dailyQuantities.fri }
                            ].map((day) => (
                              <TableRow key={day.key}>
                                <TableCell>{day.label}</TableCell>
                                <TableCell>{day.qty}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                          <TableRow sx={{ bgcolor: 'grey.50' }}>
                            <TableCell sx={{ fontWeight: 'bold' }}>Total</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>
                              {Object.values(dailyQuantities).reduce((sum, qty) => sum + qty, 0)}
                            </TableCell>
                          </TableRow>
                        </Table>
                      </TableContainer>

                      <Typography variant="body2" color="text.secondary">
                        * Prices are estimates. Final pricing will be confirmed upon admin approval.
                      </Typography>
                    </DialogContent>
                    <DialogActions>
                      <Button onClick={() => setConfirmationDialogOpen(false)} sx={{ borderRadius: 2 }}>
                        Back
                      </Button>
                      <Button
                        variant="contained"
                        onClick={() => {
                          handleWeeklyPurchaseRequest();
                          setConfirmationDialogOpen(false);
                        }}
                        sx={{
                          borderRadius: 2,
                          background: 'linear-gradient(45deg, #4CAF50 30%, #81C784 90%)',
                          '&:hover': {
                            background: 'linear-gradient(45deg, #388E3C 30%, #66BB6A 90%)',
                          }
                        }}
                        startIcon={<CheckCircleIcon />}
                      >
                        Confirm Order
                      </Button>
                    </DialogActions>
                  </Dialog>

                  {/* Reorder Notification Dialog */}
                  <Dialog
                    open={reorderDialogOpen}
                    onClose={() => setReorderDialogOpen(false)}
                    maxWidth="sm"
                    fullWidth
                  >
                    <DialogTitle sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                      Ready for Next Week?
                    </DialogTitle>
                    <DialogContent>
                      <Typography variant="body1" sx={{ mb: 2 }}>
                        Your weekly data deliveries have been completed! Would you like to place an order for next week?
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        You can reorder the same categories or adjust quantities as needed.
                      </Typography>
                    </DialogContent>
                    <DialogActions>
                      <Button onClick={() => setReorderDialogOpen(false)} sx={{ borderRadius: 2 }}>
                        Maybe Later
                      </Button>
                      <Button
                        variant="contained"
                        onClick={() => {
                          setReorderDialogOpen(false);
                          setActiveTab(1); // Navigate to Request Data Purchase tab
                        }}
                        sx={{
                          borderRadius: 2,
                          background: 'linear-gradient(45deg, #4CAF50 30%, #81C784 90%)',
                          '&:hover': {
                            background: 'linear-gradient(45deg, #388E3C 30%, #66BB6A 90%)',
                          }
                        }}
                        startIcon={<ShoppingCartIcon />}
                      >
                        Order Now
                      </Button>
                    </DialogActions>
                  </Dialog>
                </Box>}

                {/* Purchase Requests Tab */}
                {activeTab === 2 && <Box sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                      Purchase Requests
                    </Typography>
                    <Button
                      variant="outlined"
                      onClick={() => loadRequests()}
                      startIcon={<RefreshIcon />}
                      sx={{ borderRadius: 2 }}
                    >
                      Refresh
                    </Button>
                  </Box>
                  <TableContainer component={Paper} sx={{
                    borderRadius: 3,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
                  }}>
                    <Table>
                      <TableHead sx={{ bgcolor: 'primary.main' }}>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Category</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Quantity</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Status</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Date</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', color: 'white' }}>Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredRequests.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} sx={{ textAlign: 'center', py: 6 }}>
                              <AssignmentIcon sx={{ fontSize: '4rem', color: 'grey.400', mb: 2 }} />
                              <Typography variant="h6" color="text.secondary">
                                No purchase requests found
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Try adjusting your filters or create a new request
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredRequests.map((req) => (
                            <TableRow key={req._id} hover sx={{ '&:hover': { bgcolor: 'grey.50' } }}>
                              <TableCell>
                                <Chip label={req.category} color="primary" size="small" />
                              </TableCell>
                              <TableCell>
                                <Badge badgeContent={req.quantity} color="secondary">
                                  <Typography variant="body2">{req.quantity}</Typography>
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Chip
                                  label={req.status}
                                  color={
                                    req.status === 'approved' ? 'success' :
                                    req.status === 'rejected' ? 'error' :
                                    'warning'
                                  }
                                  size="small"
                                />
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2">
                                  {new Date(req.createdAt).toLocaleDateString()}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                {req.status === 'approved' && (
                                  <Box sx={{ display: 'flex', gap: 1 }}>
                                    {['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map((day, idx) => {
                                      const qty = req.dailyQuantities?.[day] || 0;
                                      if (!qty) return null;
                                      const dayData = dailyRequirementsState[req.category]?.[day] || { required: 0, uploaded: 0 };
                                      const availabilityKey = `${req._id}-${day}`;
                                      const available = (typeof requestDayAvailability[availabilityKey] !== 'undefined')
                                        ? requestDayAvailability[availabilityKey]
                                        : ((dayData.uploaded || 0) > 0);
                                      const label = ['Mon','Tue','Wed','Thu','Fri'][idx];
                                      return (
                                        <Button
                                          key={`${req._id}-${day}`}
                                          size="small"
                                          variant={downloadedButtons[`${req._id}-${day}`] ? 'contained' : (available ? 'contained' : 'outlined')}
                                          color={downloadedButtons[`${req._id}-${day}`] ? 'success' : (available ? 'success' : 'inherit')}
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            if (!available) {
                                              setError('No uploaded data for this day yet');
                                              return;
                                            }
                                            try {
                                              const start = new Date(req.weekRange.startDate);
                                              const target = new Date(start);
                                              target.setDate(start.getDate() + idx);
                                              const iso = target.toISOString().split('T')[0];

                                              // Always attempt allocation/download for this date — this ensures first downloader gets FIFO allocation
                                              const p = await dataAPI.collectDaily({ date: iso });
                                              const allocations = p.data.allocations || [];
                                              const allocForReq = allocations.find(a => String(a.purchaseRequestId) === String(req._id));
                                              if (!allocForReq || !allocForReq.data || allocForReq.data.length === 0) {
                                                showToast('No allocated data available for this request/date', 'warning');
                                                return;
                                              }

                                              const rows = allocForReq.data.map(it => ({ ...it.metadata, index: it.index }));
                                              const ws = XLSX.utils.json_to_sheet(rows);
                                              const wb = XLSX.utils.book_new();
                                              XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
                                              XLSX.writeFile(wb, `${req.category}_${label}_${iso}.xlsx`);
                                              showToast('Downloaded allocated data', 'success');

                                              // mark as downloaded (persist in localStorage so color survives refresh)
                                              const key = `${req._id}-${day}`;
                                              setDownloadedButtons(prev => {
                                                const next = { ...prev, [key]: true };
                                                try { localStorage.setItem('downloadedButtons', JSON.stringify(next)); } catch (e) {}
                                                return next;
                                              });
                                            } catch (err) {
                                              const msg = err.response?.data?.message || 'Failed to download allocated data';
                                              showToast(msg, 'error');
                                            }
                                          }}
                                        >
                                          {label}
                                        </Button>
                                      );
                                    })}
                                  </Box>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>}

                {/* Purchased Data Tab */}
                {activeTab === 3 && <Box sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                      Purchased Data
                    </Typography>
                    <Button
                      variant="outlined"
                      onClick={() => loadPurchased()}
                      startIcon={<RefreshIcon />}
                      sx={{ borderRadius: 2 }}
                    >
                      Refresh
                    </Button>
                  </Box>

                  {filteredPurchased.length === 0 ? (
                    <Card sx={{
                      borderRadius: 3,
                      boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                      background: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%)'
                    }}>
                      <CardContent sx={{ textAlign: 'center', py: 6 }}>
                        <DataUsageIcon sx={{ fontSize: '4rem', color: 'grey.400', mb: 2 }} />
                        <Typography variant="h6" color="text.secondary">
                          No purchased data found
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Your purchased data will appear here
                        </Typography>
                      </CardContent>
                    </Card>
                  ) : (
                    filteredPurchased.map((purchase) => (
                      <Card key={purchase._id} sx={{
                        mb: 3,
                        borderRadius: 3,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                        background: 'linear-gradient(145deg, #f8f9ff 0%, #ffffff 100%)'
                      }}>
                        <CardContent sx={{ p: 3 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                                Purchase #{purchase._id.slice(-6)}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {new Date(purchase.purchasedAt).toLocaleDateString()} • {purchase.dataItems.length} items
                              </Typography>
                            </Box>
                            <Box sx={{ textAlign: 'right' }}>
                              <Button
                                variant="outlined"
                                size="small"
                                onClick={() => handleDownloadData(purchase)}
                                sx={{
                                  mt: 1,
                                  borderRadius: 2,
                                  borderColor: 'success.main',
                                  color: 'success.main',
                                  '&:hover': {
                                    borderColor: 'success.dark',
                                    bgcolor: 'success.light',
                                    color: 'success.dark'
                                  }
                                }}
                                startIcon={<DownloadIcon />}
                              >
                                Download Excel
                              </Button>
                            </Box>
                          </Box>
                          <Divider sx={{ my: 2 }} />
                          <TableContainer component={Paper} sx={{
                            borderRadius: 2,
                            boxShadow: '0 1px 4px rgba(0,0,0,0.1)'
                          }}>
                            <Table size="small">
                              <TableHead sx={{ bgcolor: 'grey.50' }}>
                                <TableRow>
                                  <TableCell sx={{ fontWeight: 'bold' }}>Index</TableCell>
                                  <TableCell sx={{ fontWeight: 'bold' }}>Category</TableCell>
                                  <TableCell sx={{ fontWeight: 'bold' }}>Price</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {purchase.dataItems.map((item) => (
                                  <TableRow key={item.index} hover sx={{ '&:hover': { bgcolor: 'grey.50' } }}>
                                    <TableCell>
                                      <Chip
                                        label={item.index}
                                        size="small"
                                        color="primary"
                                        variant="outlined"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                        {item.category}
                                      </Typography>
                                    </TableCell>
                                    <TableCell>
                                      <Typography variant="body2" color="primary" sx={{ fontWeight: 'bold' }}>
                                        ${item.price}
                                      </Typography>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </Box>
                }
                // {/* Profile Tab */}
                {activeTab === 4 && <Box sx={{ p: 3 }}>
                  <Typography variant="h5" sx={{ mb: 4, fontWeight: 'bold', color: 'primary.main' }}>
                    Profile Settings
                  </Typography>

                  <Grid container spacing={3}>
                    <Grid item xs={12} md={8}>
                      <Card sx={{
                        borderRadius: 3,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                        background: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%)'
                      }}>
                        <CardContent sx={{ p: 3 }}>
                          <Typography variant="h6" sx={{ mb: 3, fontWeight: 'bold' }}>
                            {isEditing ? 'Edit Your Profile' : (profile.firstName ? 'Your Profile Information' : 'Add Your Profile Information')}
                          </Typography>

                          {isEditing || !profile.firstName ? (
                            <>
                              <TextField
                                fullWidth
                                label="Email"
                                type="email"
                                value={profile.email || user?.email || ''}
                                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                                sx={{ mb: 3, borderRadius: 2 }}
                              />

                              <TextField
                                fullWidth
                                label="First Name"
                                value={profile.firstName || ''}
                                onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                                sx={{ mb: 3, borderRadius: 2 }}
                              />

                              <TextField
                                fullWidth
                                label="Last Name"
                                value={profile.lastName || ''}
                                onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                                sx={{ mb: 3, borderRadius: 2 }}
                              />

                              <TextField
                                fullWidth
                                label="Company"
                                value={profile.company || ''}
                                onChange={(e) => setProfile({ ...profile, company: e.target.value })}
                                sx={{ mb: 3, borderRadius: 2 }}
                              />

                              <TextField
                                fullWidth
                                label="Phone"
                                value={profile.phone || ''}
                                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                                sx={{ mb: 3, borderRadius: 2 }}
                              />

                              <TextField
                                fullWidth
                                label="Street"
                                value={profile.address?.street || ''}
                                onChange={(e) => setProfile({
                                  ...profile,
                                  address: { ...profile.address, street: e.target.value }
                                })}
                                sx={{ mb: 3, borderRadius: 2 }}
                              />

                              <TextField
                                fullWidth
                                label="City"
                                value={profile.address?.city || ''}
                                onChange={(e) => setProfile({
                                  ...profile,
                                  address: { ...profile.address, city: e.target.value }
                                })}
                                sx={{ mb: 3, borderRadius: 2 }}
                              />

                              <TextField
                                fullWidth
                                label="State"
                                value={profile.address?.state || ''}
                                onChange={(e) => setProfile({
                                  ...profile,
                                  address: { ...profile.address, state: e.target.value }
                                })}
                                sx={{ mb: 3, borderRadius: 2 }}
                              />

                              <TextField
                                fullWidth
                                label="Zip Code"
                                value={profile.address?.zipCode || ''}
                                onChange={(e) => setProfile({
                                  ...profile,
                                  address: { ...profile.address, zipCode: e.target.value }
                                })}
                                sx={{ mb: 3, borderRadius: 2 }}
                              />

                              <TextField
                                fullWidth
                                label="Country"
                                value={profile.address?.country || ''}
                                onChange={(e) => setProfile({
                                  ...profile,
                                  address: { ...profile.address, country: e.target.value }
                                })}
                                sx={{ mb: 3, borderRadius: 2 }}
                              />

                              <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
                                {profile.firstName && (
                                <Button
                                  variant="outlined"
                                  size="large"
                                  onClick={() => setIsEditing(false)}
                                  sx={{ borderRadius: 2, flex: 1 }}
                                  title="Cancel editing and return to view mode"
                                >
                                  Cancel
                                </Button>
                                )}
                                <Button
                                  variant="contained"
                                  size="large"
                                  onClick={handleSaveProfile}
                                  sx={{
                                    borderRadius: 2,
                                    background: 'linear-gradient(45deg, #4CAF50 30%, #81C784 90%)',
                                    '&:hover': {
                                      background: 'linear-gradient(45deg, #388E3C 30%, #66BB6A 90%)',
                                    },
                                    flex: 1
                                  }}
                                  startIcon={<PersonIcon />}
                                >
                                  Save Profile
                                </Button>
                              </Box>
                            </>
                          ) : (
                            <>
                              <Box sx={{ mb: 3 }}>
                                <Typography variant="body1" sx={{ mb: 1 }}>
                                  <strong>Email:</strong> {profile.email || user?.email}
                                </Typography>
                                <Typography variant="body1" sx={{ mb: 1 }}>
                                  <strong>Name:</strong> {profile.firstName} {profile.lastName}
                                </Typography>
                                <Typography variant="body1" sx={{ mb: 1 }}>
                                  <strong>Company:</strong> {profile.company}
                                </Typography>
                                <Typography variant="body1" sx={{ mb: 1 }}>
                                  <strong>Phone:</strong> {profile.phone}
                                </Typography>
                                {(profile.address?.street || profile.address?.city || profile.address?.state || profile.address?.zipCode || profile.address?.country) && (
                                  <>
                                    <Typography variant="body1" sx={{ mb: 1 }}>
                                      <strong>Address:</strong>
                                    </Typography>
                                    {profile.address?.street && (
                                      <Typography variant="body2" sx={{ ml: 2, mb: 0.5 }}>
                                        {profile.address.street}
                                      </Typography>
                                    )}
                                    {(profile.address?.city || profile.address?.state || profile.address?.zipCode) && (
                                      <Typography variant="body2" sx={{ ml: 2, mb: 0.5 }}>
                                        {[profile.address?.city, profile.address?.state, profile.address?.zipCode].filter(Boolean).join(', ')}
                                      </Typography>
                                    )}
                                    {profile.address?.country && (
                                      <Typography variant="body2" sx={{ ml: 2, mb: 1 }}>
                                        {profile.address.country}
                                      </Typography>
                                    )}
                                  </>
                                )}
                              </Box>

                              <Button
                                variant="outlined"
                                size="large"
                                onClick={() => setIsEditing(true)}
                                sx={{
                                  borderRadius: 2,
                                  borderColor: 'primary.main',
                                  color: 'primary.main',
                                  '&:hover': {
                                    borderColor: 'primary.dark',
                                    backgroundColor: 'primary.light',
                                  }
                                }}
                                startIcon={<EditIcon />}
                              >
                                Edit Profile
                              </Button>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>

                    <Grid item xs={12} md={4}>
                      <Card sx={{
                        borderRadius: 3,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                        background: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%)'
                      }}>
                        <CardContent sx={{ p: 3, textAlign: 'center' }}>
                          <Avatar sx={{ width: 80, height: 80, mx: 'auto', mb: 2, bgcolor: 'primary.main' }}>
                            <PersonIcon sx={{ fontSize: '2rem' }} />
                          </Avatar>
                          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                            {user?.email}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            User Account
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>
                </Box>}

            </Card>
      </Container>
    </Box>
  );
};

export default UserDashboard;


