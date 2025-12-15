import React, { useState, useEffect } from 'react';
import { userDataAPI } from '../services/api';
import { useToast } from '../context/ToastContext';
import './UserDataDashboard.css';

const UserDataDashboard = () => {
  const [allocatedData, setAllocatedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { showToast } = useToast();
  const [selectedAllocation, setSelectedAllocation] = useState(null);

  useEffect(() => {
    fetchAllocatedData();
  }, []);

  const fetchAllocatedData = async () => {
    try {
      setLoading(true);
      const response = await userDataAPI.getAllocatedData();
      setAllocatedData(response.data);
    } catch (err) {
      const msg = 'Failed to fetch allocated data';
      showToast(msg, 'error');
      console.error('Error fetching allocated data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (allocation) => {
    try {
      const dateStr = allocation.date.split('T')[0];
      const response = await userDataAPI.getAllocatedDataByDate(allocation.category, dateStr);
      setSelectedAllocation({
        ...allocation,
        details: response.data
      });
    } catch (err) {
      const msg = 'Failed to fetch allocation details';
      showToast(msg, 'error');
      console.error('Error fetching allocation details:', err);
    }
  };

  const handleDownload = async (allocation) => {
    try {
      const dateStr = allocation.date.split('T')[0];
      const response = await userDataAPI.downloadAllocatedData(allocation.category, dateStr);

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${allocation.category}_${dateStr}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const msg = 'Failed to download data';
      showToast(msg, 'error');
      console.error('Error downloading data:', err);
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return <div className="loading">Loading your allocated data...</div>;
  }

  if (error) {
    // error shown via toast
  }

  return (
    <div className="user-data-dashboard">
      <h2>My Allocated Data</h2>

      {allocatedData.length === 0 ? (
        <div className="no-data">
          <p>No data has been allocated to you yet.</p>
          <p>Data will be allocated automatically when your purchase requests are approved.</p>
        </div>
      ) : (
        <div className="allocations-grid">
          {allocatedData.map((allocation, index) => (
            <div key={index} className="allocation-card">
              <div className="allocation-header">
                <h3>{allocation.category}</h3>
                <span className="day-badge">{allocation.dayOfWeek}</span>
              </div>

              <div className="allocation-info">
                <p><strong>Date:</strong> {formatDate(allocation.date)}</p>
                <p><strong>Items Allocated:</strong> {allocation.totalAllocated}</p>
              </div>

              <div className="allocation-actions">
                <button
                  onClick={() => handleViewDetails(allocation)}
                  className="btn-view"
                >
                  View Details
                </button>
                <button
                  onClick={() => handleDownload(allocation)}
                  className="btn-download"
                >
                  Download Excel
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedAllocation && (
        <div className="allocation-details-modal">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{selectedAllocation.category} - {formatDate(selectedAllocation.date)}</h3>
              <button
                onClick={() => setSelectedAllocation(null)}
                className="close-btn"
              >
                ×
              </button>
            </div>

            <div className="data-preview">
              <p><strong>Total Items:</strong> {selectedAllocation.details.totalItems}</p>

              <div className="data-table">
                <table>
                  <thead>
                    <tr>
                      {selectedAllocation.details.data.length > 0 &&
                        Object.keys(selectedAllocation.details.data[0]).map(key => (
                          <th key={key}>{key}</th>
                        ))
                      }
                    </tr>
                  </thead>
                  <tbody>
                    {selectedAllocation.details.data.slice(0, 10).map((row, index) => (
                      <tr key={index}>
                        {Object.values(row).map((value, idx) => (
                          <td key={idx}>{String(value)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {selectedAllocation.details.data.length > 10 && (
                  <p className="more-data-note">
                    Showing first 10 rows. Download the Excel file to see all data.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserDataDashboard;
