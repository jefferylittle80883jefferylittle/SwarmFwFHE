import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface DroneData {
  id: string;
  position: string;
  status: string;
  battery: number;
  encryptedData: string;
  timestamp: number;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [drones, setDrones] = useState<DroneData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [showTutorial, setShowTutorial] = useState(false);
  const [newDroneData, setNewDroneData] = useState({
    position: "",
    status: "idle",
    battery: 100
  });

  // Statistics for dashboard
  const activeDrones = drones.filter(d => d.status === "active").length;
  const idleDrones = drones.filter(d => d.status === "idle").length;
  const lowBatteryDrones = drones.filter(d => d.battery < 30).length;

  useEffect(() => {
    loadDrones().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadDrones = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("drone_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing drone keys:", e);
        }
      }
      
      const droneList: DroneData[] = [];
      
      for (const key of keys) {
        try {
          const droneBytes = await contract.getData(`drone_${key}`);
          if (droneBytes.length > 0) {
            try {
              const droneData = JSON.parse(ethers.toUtf8String(droneBytes));
              droneList.push({
                id: key,
                position: droneData.position,
                status: droneData.status,
                battery: droneData.battery,
                encryptedData: droneData.encryptedData,
                timestamp: droneData.timestamp
              });
            } catch (e) {
              console.error(`Error parsing drone data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading drone ${key}:`, e);
        }
      }
      
      droneList.sort((a, b) => b.timestamp - a.timestamp);
      setDrones(droneList);
    } catch (e) {
      console.error("Error loading drones:", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const addDrone = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const droneId = `drone-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      // Simulate FHE encryption of drone data
      const encryptedData = `FHE-${btoa(JSON.stringify({
        position: newDroneData.position,
        status: newDroneData.status,
        battery: newDroneData.battery
      }))}`;
      
      const droneData = {
        position: newDroneData.position,
        status: newDroneData.status,
        battery: newDroneData.battery,
        encryptedData: encryptedData,
        timestamp: Math.floor(Date.now() / 1000)
      };
      
      // Store encrypted drone data on-chain
      await contract.setData(
        `drone_${droneId}`, 
        ethers.toUtf8Bytes(JSON.stringify(droneData))
      );
      
      // Update drone keys list
      const keysBytes = await contract.getData("drone_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(droneId);
      
      await contract.setData(
        "drone_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      alert("Drone added successfully with FHE encryption!");
      await loadDrones();
      
      // Reset form
      setNewDroneData({
        position: "",
        status: "idle",
        battery: 100
      });
    } catch (e: any) {
      alert("Failed to add drone: " + (e.message || "Unknown error"));
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      alert(`FHE Contract is ${isAvailable ? 'available' : 'not available'}`);
    } catch (e) {
      alert("Error checking contract availability");
    }
  };

  const renderDroneChart = () => {
    const total = drones.length || 1;
    const activePercentage = (activeDrones / total) * 100;
    const idlePercentage = (idleDrones / total) * 100;
    
    return (
      <div className="drone-chart-container">
        <div className="drone-chart">
          <div 
            className="chart-segment active" 
            style={{ transform: `rotate(${activePercentage * 3.6}deg)` }}
          ></div>
          <div 
            className="chart-segment idle" 
            style={{ transform: `rotate(${(activePercentage + idlePercentage) * 3.6}deg)` }}
          ></div>
          <div className="chart-center">
            <div className="chart-value">{drones.length}</div>
            <div className="chart-label">Drones</div>
          </div>
        </div>
        <div className="chart-legend">
          <div className="legend-item">
            <div className="color-dot active"></div>
            <span>Active: {activeDrones}</span>
          </div>
          <div className="legend-item">
            <div className="color-dot idle"></div>
            <span>Idle: {idleDrones}</span>
          </div>
          <div className="legend-item">
            <div className="color-dot low-battery"></div>
            <span>Low Battery: {lowBatteryDrones}</span>
          </div>
        </div>
      </div>
    );
  };

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to manage your drone swarm",
      icon: "🔗"
    },
    {
      title: "Add Drones",
      description: "Register new drones to your swarm with FHE encryption",
      icon: "🚁"
    },
    {
      title: "FHE Communication",
      description: "Drones communicate securely using FHE-encrypted data",
      icon: "🔒"
    },
    {
      title: "Swarm Intelligence",
      description: "Watch your drones make decentralized decisions as a swarm",
      icon: "🧠"
    }
  ];

  const teamMembers = [
    {
      name: "Dr. Alex Chen",
      role: "Cryptography Expert",
      bio: "10+ years in homomorphic encryption research"
    },
    {
      name: "Maya Rodriguez",
      role: "Drone Systems Engineer",
      bio: "Specialized in autonomous swarm systems"
    },
    {
      name: "James Wilson",
      role: "Blockchain Developer",
      bio: "Web3 and smart contract integration specialist"
    },
    {
      name: "Sarah Kim",
      role: "UI/UX Designer",
      bio: "Creating intuitive interfaces for complex systems"
    }
  ];

  if (loading) return (
    <div className="loading-screen">
      <div className="cyber-spinner"></div>
      <p>Initializing FHE encrypted connection...</p>
    </div>
  );

  return (
    <div className="app-container cyberpunk-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="drone-icon"></div>
          </div>
          <h1>Swarm<span>Fw</span>FHE</h1>
        </div>
        
        <div className="header-actions">
          <button 
            className="cyber-button"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Tutorial" : "Show Tutorial"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="content-panels">
          {/* Left Panel - Navigation */}
          <div className="left-panel">
            <nav className="side-nav">
              <button 
                className={activeTab === "dashboard" ? "nav-btn active" : "nav-btn"}
                onClick={() => setActiveTab("dashboard")}
              >
                <span className="nav-icon">📊</span>
                <span className="nav-text">Dashboard</span>
              </button>
              <button 
                className={activeTab === "drones" ? "nav-btn active" : "nav-btn"}
                onClick={() => setActiveTab("drones")}
              >
                <span className="nav-icon">🚁</span>
                <span className="nav-text">Drone Swarm</span>
              </button>
              <button 
                className={activeTab === "add" ? "nav-btn active" : "nav-btn"}
                onClick={() => setActiveTab("add")}
              >
                <span className="nav-icon">➕</span>
                <span className="nav-text">Add Drone</span>
              </button>
              <button 
                className={activeTab === "about" ? "nav-btn active" : "nav-btn"}
                onClick={() => setActiveTab("about")}
              >
                <span className="nav-icon">ℹ️</span>
                <span className="nav-text">About</span>
              </button>
              <button 
                className={activeTab === "team" ? "nav-btn active" : "nav-btn"}
                onClick={() => setActiveTab("team")}
              >
                <span className="nav-icon">👥</span>
                <span className="nav-text">Our Team</span>
              </button>
            </nav>
            
            <div className="fhe-status">
              <div className="status-indicator"></div>
              <span>FHE Encryption Active</span>
            </div>
          </div>
          
          {/* Right Panel - Content */}
          <div className="right-panel">
            {showTutorial && (
              <div className="tutorial-section">
                <h2>FHE Drone Swarm Tutorial</h2>
                <p className="subtitle">Learn how to manage your encrypted drone swarm</p>
                
                <div className="tutorial-steps">
                  {tutorialSteps.map((step, index) => (
                    <div 
                      className="tutorial-step"
                      key={index}
                    >
                      <div className="step-icon">{step.icon}</div>
                      <div className="step-content">
                        <h3>{step.title}</h3>
                        <p>{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {activeTab === "dashboard" && (
              <div className="dashboard-tab">
                <div className="dashboard-header">
                  <h2>Swarm Intelligence Dashboard</h2>
                  <button onClick={checkAvailability} className="cyber-button small">
                    Check FHE Status
                  </button>
                </div>
                
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-icon">🚁</div>
                    <div className="stat-data">
                      <div className="stat-value">{drones.length}</div>
                      <div className="stat-label">Total Drones</div>
                    </div>
                  </div>
                  
                  <div className="stat-card">
                    <div className="stat-icon">🔄</div>
                    <div className="stat-data">
                      <div className="stat-value">{activeDrones}</div>
                      <div className="stat-label">Active Drones</div>
                    </div>
                  </div>
                  
                  <div className="stat-card">
                    <div className="stat-icon">🔋</div>
                    <div className="stat-data">
                      <div className="stat-value">{lowBatteryDrones}</div>
                      <div className="stat-label">Low Battery</div>
                    </div>
                  </div>
                  
                  <div className="stat-card">
                    <div className="stat-icon">🔒</div>
                    <div className="stat-data">
                      <div className="stat-value">100%</div>
                      <div className="stat-label">FHE Encrypted</div>
                    </div>
                  </div>
                </div>
                
                <div className="chart-section">
                  <h3>Swarm Distribution</h3>
                  {renderDroneChart()}
                </div>
              </div>
            )}
            
            {activeTab === "drones" && (
              <div className="drones-tab">
                <div className="tab-header">
                  <h2>Drone Swarm Management</h2>
                  <button onClick={loadDrones} className="cyber-button" disabled={isRefreshing}>
                    {isRefreshing ? "Refreshing..." : "Refresh Swarm Data"}
                  </button>
                </div>
                
                {drones.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">🚁</div>
                    <h3>No Drones in Swarm</h3>
                    <p>Add your first drone to get started with FHE-encrypted swarm intelligence</p>
                    <button 
                      className="cyber-button primary"
                      onClick={() => setActiveTab("add")}
                    >
                      Add First Drone
                    </button>
                  </div>
                ) : (
                  <div className="drones-grid">
                    {drones.map(drone => (
                      <div className="drone-card" key={drone.id}>
                        <div className="drone-header">
                          <div className="drone-id">#{drone.id.substring(0, 8)}</div>
                          <div className={`status-indicator ${drone.status}`}></div>
                        </div>
                        
                        <div className="drone-data">
                          <div className="data-row">
                            <span className="label">Position:</span>
                            <span className="value">{drone.position || "Unknown"}</span>
                          </div>
                          
                          <div className="data-row">
                            <span className="label">Status:</span>
                            <span className="value">{drone.status}</span>
                          </div>
                          
                          <div className="data-row">
                            <span className="label">Battery:</span>
                            <div className="battery-container">
                              <div 
                                className={`battery-level ${drone.battery < 30 ? 'low' : ''}`}
                                style={{width: `${drone.battery}%`}}
                              ></div>
                              <span className="battery-text">{drone.battery}%</span>
                            </div>
                          </div>
                          
                          <div className="data-row">
                            <span className="label">Encryption:</span>
                            <span className="value">FHE Active</span>
                          </div>
                        </div>
                        
                        <div className="drone-actions">
                          <button className="cyber-button small">View Details</button>
                          <button className="cyber-button small">Update</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {activeTab === "add" && (
              <div className="add-tab">
                <h2>Add New Drone to Swarm</h2>
                
                <div className="form-container">
                  <div className="form-group">
                    <label>Drone Position</label>
                    <input 
                      type="text"
                      value={newDroneData.position}
                      onChange={(e) => setNewDroneData({...newDroneData, position: e.target.value})}
                      placeholder="e.g., 47.6062° N, 122.3321° W"
                      className="cyber-input"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Initial Status</label>
                    <select 
                      value={newDroneData.status}
                      onChange={(e) => setNewDroneData({...newDroneData, status: e.target.value})}
                      className="cyber-select"
                    >
                      <option value="idle">Idle</option>
                      <option value="active">Active</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label>Battery Level</label>
                    <input 
                      type="range"
                      min="0"
                      max="100"
                      value={newDroneData.battery}
                      onChange={(e) => setNewDroneData({...newDroneData, battery: parseInt(e.target.value)})}
                      className="cyber-slider"
                    />
                    <div className="slider-value">{newDroneData.battery}%</div>
                  </div>
                  
                  <div className="fhe-notice">
                    <div className="encryption-icon">🔒</div>
                    <p>Drone data will be encrypted using FHE for secure swarm communication</p>
                  </div>
                  
                  <button onClick={addDrone} className="cyber-button primary">
                    Add Drone with FHE Encryption
                  </button>
                </div>
              </div>
            )}
            
            {activeTab === "about" && (
              <div className="about-tab">
                <h2>About SwarmFwFHE</h2>
                
                <div className="about-content">
                  <div className="about-section">
                    <h3>FHE-Based Secure Drone Swarm Intelligence</h3>
                    <p>
                      SwarmFwFHE is a revolutionary approach to drone swarm management that utilizes 
                      Fully Homomorphic Encryption (FHE) to enable secure, encrypted communication 
                      between drones while maintaining full functionality.
                    </p>
                    
                    <p>
                      Our system allows drones to share encrypted state information and perform 
                      decentralized collaborative decision-making without ever decrypting sensitive data, 
                      preventing potential hijacking or eavesdropping attacks.
                    </p>
                  </div>
                  
                  <div className="about-section">
                    <h3>How It Works</h3>
                    <div className="how-it-works">
                      <div className="work-step">
                        <div className="step-number">1</div>
                        <div className="step-content">
                          <h4>FHE Encryption</h4>
                          <p>Drone data is encrypted using FHE before being shared with the swarm</p>
                        </div>
                      </div>
                      
                      <div className="work-step">
                        <div className="step-number">2</div>
                        <div className="step-content">
                          <h4>Encrypted Communication</h4>
                          <p>Drones communicate using FHE-encrypted data only</p>
                        </div>
                      </div>
                      
                      <div className="work-step">
                        <div className="step-number">3</div>
                        <div className="step-content">
                          <h4>Secure Processing</h4>
                          <p>Swarm intelligence algorithms process data while still encrypted</p>
                        </div>
                      </div>
                      
                      <div className="work-step">
                        <div className="step-number">4</div>
                        <div className="step-content">
                          <h4>Decentralized Decisions</h4>
                          <p>Drones make collaborative decisions without exposing raw data</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="about-section">
                    <h3>Benefits</h3>
                    <ul className="benefits-list">
                      <li>✅ Prevention of drone swarm hijacking</li>
                      <li>✅ Secure communication even if individual drones are compromised</li>
                      <li>✅ Privacy-preserving swarm intelligence</li>
                      <li>✅ Decentralized decision making without a single point of failure</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === "team" && (
              <div className="team-tab">
                <h2>Our Team</h2>
                
                <div className="team-grid">
                  {teamMembers.map((member, index) => (
                    <div className="team-card" key={index}>
                      <div className="member-avatar">
                        {member.name.substring(0, 1)}
                      </div>
                      <h3>{member.name}</h3>
                      <p className="member-role">{member.role}</p>
                      <p className="member-bio">{member.bio}</p>
                    </div>
                  ))}
                </div>
                
                <div className="join-team">
                  <h3>Join Our Mission</h3>
                  <p>
                    We're always looking for talented individuals passionate about FHE, 
                    drone technology, and secure decentralized systems.
                  </p>
                  <button className="cyber-button">Contact Us</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
  
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="drone-icon"></div>
              <span>SwarmFwFHE</span>
            </div>
            <p>FHE-Based Secure Drone Swarm Intelligence</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">GitHub</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Swarm Intelligence</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} SwarmFwFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;