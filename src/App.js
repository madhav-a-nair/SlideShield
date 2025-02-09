import React, { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, get } from "firebase/database";
import { Line } from "react-chartjs-2";
import { Chart as ChartJS } from "chart.js/auto";
import logo from "./assets/logo.png";

const firebaseConfig = {
  apiKey: "AIzaSyCZP2DNCdNRItQ_VSK8Gf3W6M9Tc2kTOZQ",
  authDomain: "slideshield-2580-default-rtdb.firebaseio.com",
  projectId: "slideshield-2580",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

function App() {
  const [data, setData] = useState({ temperature: [], humidity: [], soil_moisture: [], rainfall: [], pitch: [], roll: [], timestamps: [] });
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [selectedSite, setSelectedSite] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [sites, setSites] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [dbPath, setDbPath] = useState(null);
  const [loadingSites, setLoadingSites] = useState(true);
  const [loadingNodes, setLoadingNodes] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState(null);
  const [alert, setAlert] = useState(null);
  const [previousData, setPreviousData] = useState(null);

  useEffect(() => {
    const sitesRef = ref(db);
    setLoadingSites(true);
    get(sitesRef)
      .then((snapshot) => {
        const data = snapshot.val();
        if (data) {
          const siteNames = Object.keys(data);
          setSites(siteNames);
          if (siteNames.length > 0) {
            setSelectedSite(siteNames[0]);
          }
        }
      })
      .catch((error) => {
        console.error("Error fetching sites:", error);
        setError("Error loading sites.");
      })
      .finally(() => setLoadingSites(false));
  }, []);

  useEffect(() => {
    if (selectedSite) {
      const nodesRef = ref(db, selectedSite);
      setLoadingNodes(true);
      get(nodesRef)
        .then((snapshot) => {
          const siteData = snapshot.val();
          if (siteData) {
            const nodeNames = Object.keys(siteData).filter((key) => !["alerts", "thresholds"].includes(key));
            setNodes(nodeNames);
            if (nodeNames.length > 0) {
              setSelectedNode(nodeNames[0]);
            } else {
              setData({ temperature: [], humidity: [], soil_moisture: [], rainfall: [], pitch: [], roll: [], timestamps: [] });
              setInitialDataLoaded(true);
            }
          }
        })
        .catch((error) => {
          console.error("Error fetching nodes:", error);
          setError("Error loading nodes.");
        })
        .finally(() => setLoadingNodes(false));
    } else {
      setNodes([]);
      setSelectedNode(null);
      setLoadingNodes(false);
    }
  }, [selectedSite]);

  useEffect(() => {
    let dataRef;
    let unsubscribe;
    let alertsRef;

    if (selectedSite && selectedNode) {
      const path = `/${selectedSite}/${selectedNode}`;
      setDbPath(path);
      dataRef = ref(db, path);
      alertsRef = ref(db, `/${selectedSite}/alerts/${selectedNode}`);
      setLoadingData(true);

      const fetchData = (snapshot) => {
        const newData = snapshot.val();

        if (newData && Array.isArray(newData)) {
          const updatedData = { ...data };
          updatedData.timestamps = newData.map((item) => (item.date && item.time ? `${item.date} ${item.time}` : new Date().toLocaleTimeString()));
          const parameterKeys = Object.keys(newData[0]).filter((key) => key !== "date" && key !== "time");
          parameterKeys.forEach((key) => {
            updatedData[key] = newData.map((item) => {
              const value = item[key];
              if (typeof value === "string") {
                const num = parseFloat(value);
                return isNaN(num) ? null : num;
              } else if (typeof value === "number") {
                return value;
              } else {
                return null;
              }
            });
          });
          setData(updatedData);
          setInitialDataLoaded(true);

          const lastData = newData[newData.length - 1];
          get(alertsRef).then((alertsSnapshot) => {
            const alertsData = alertsSnapshot.val();
            if (alertsData) {
              checkAlert(lastData, alertsData);
            }
          });

          setPreviousData(lastData);
        } else {
          console.warn("Data format incorrect or missing.");
          setData({ temperature: [], humidity: [], soil_moisture: [], rainfall: [], pitch: [], roll: [], timestamps: [] });
          setInitialDataLoaded(true);
        }
      };

      const checkAlert = (lastData, alertsData) => {
        var movement = false;
        if (previousData) {
          movement = Math.abs(lastData.roll - previousData.roll) >= 10 || Math.abs(lastData.pitch - previousData.pitch) >= 10;
        } else {
          movement = false;
        }
        let currentAlert = null;
        for (const alertLevel in alertsData) {
          const alertConditions = alertsData[alertLevel];
          if (Array.isArray(alertConditions)) {
            for (const condition of alertConditions) {
              console.log(lastData.soil_moisture, movement);
              console.log(condition)
              if (lastData.soil_moisture >= condition.min_moist && lastData.soil_moisture <= condition.max_moist && condition.movement == movement) {
                currentAlert = alertLevel;
                break;
              }
            }
          }
          if (currentAlert) break;
        }
        setAlert(currentAlert);
      };

      console.log(dataRef)

      get(dataRef)
        .then(fetchData)
        .catch((error) => {
          console.error("Error fetching data:", error);
          setError("Error loading data.");
        })
        .finally(() => setLoadingData(false));

      unsubscribe = onValue(dataRef, fetchData);
    } else {
      setData({ temperature: [], humidity: [], soil_moisture: [], rainfall: [], pitch: [], roll: [], timestamps: [] });
      setInitialDataLoaded(false);
      setDbPath(null);
      setLoadingData(false);
      setPreviousData(null);
      setAlert(null);
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [selectedSite, selectedNode]);

  const chartData = (parameter) => ({
    labels: data.timestamps,
    datasets: [
      {
        label: parameter,
        data: data[parameter.toLowerCase()],
        fill: false,
        borderColor: "rgb(75, 192, 192)",
        tension: 0.4,
      },
    ],
  });

  const chartOptions = {
    scales: {
      x: {
        type: "category",
        ticks: {
          autoSkip: true,
          maxTicksLimit: 10,
        },
      },
    },
    responsive: true,
    maintainAspectRatio: false,
  };

  const handleSiteChange = (event) => {
    setSelectedSite(event.target.value);
    setSelectedNode(null);
    setNodes([]);
  };

  const handleNodeChange = (event) => {
    setSelectedNode(event.target.value);
  };

  const alertBannerStyle = () => {
    switch (alert) {
      case "ALERT":
        return { backgroundColor: "#FFC000", color: "black" };
      case "ATTENTION":
        return { backgroundColor: "#03C0EF", color: "black" };
      case "EVACUATE":
        return { backgroundColor: "#FB5043", color: "black" };
      case "NONE":
        return { backgroundColor: "#02DB05", color: "black" };
      default:
        return { backgroundColor: "gray", color: "black" };
    }
  };

  return (
    <div className="App" style={{ padding: "20px" }}>
      <img
        style={{ width: "100%", alignSelf: "center" }}
        src={logo}
        alt="Logo"
      />
      {
        <div
          style={{
            ...alertBannerStyle(),
            borderRadius: "15px",
            padding: "10px 90px",
            fontSize: "2em",
            textAlign: "center",
            fontWeight: "bold",
            marginBottom: "10px",
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignContent: "center",
            boxShadow: "10px 10px 20px #c9c9c9",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <select
              style={{
                height: "35px",
                width: "160px",
                marginRight: "30PX",
                fontWeight: "bold",
                textAlign: "center",
                backgroundColor: "transparent",
                fontSize: "18px",
                border: "2px solid black",
                borderRadius: "10px",
              }}
              value={selectedSite || ""}
              onChange={handleSiteChange}
              disabled={loadingSites}
            >
              <option value="">Select Site</option>
              {sites.map((site) => (
                <option key={site} value={site}>
                  {site}
                </option>
              ))}
            </select>
            <select
              style={{
                height: "35px",
                width: "160px",
                marginRight: "30PX",
                fontWeight: "bold",
                textAlign: "center",
                backgroundColor: "transparent",
                fontSize: "18px",
                border: "2px solid black",
                borderRadius: "10px",
              }}
              value={selectedNode || ""}
              onChange={handleNodeChange}
              disabled={!selectedSite || loadingNodes}
            >
              <option value="">Select Node</option>
              {nodes.map((node) => (
                <option key={node} value={node}>
                  {node}
                </option>
              ))}
            </select>
          </div>
          {alert}
        </div>
      }

      {loadingSites || loadingNodes || loadingData ? (
        <div>Loading...</div>
      ) : null}
      {error && <div style={{ color: "red" }}>{error}</div>}
      {initialDataLoaded &&
        Object.keys(data)
          .filter(
            (key) =>
              Array.isArray(data[key]) && key !== "timestamps" && key !== "alt"
          )
          .reduce((rows, parameter, index) => {
            if (index % 2 === 0) {
              rows.push([parameter]);
            } else {
              rows[rows.length - 1].push(parameter);
            }
            return rows;
          }, [])
          .map((row, rowIndex) => (
            <div
              key={rowIndex}
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "90px",
              }}
            >
              {row.map((parameter) => (
                <div key={parameter} style={{ width: "48%", height: "220px" }}>
                  <h2>{parameter}</h2>
                  <Line data={chartData(parameter)} options={chartOptions} />
                </div>
              ))}
            </div>
          ))}
    </div>
  );
}

export default App;