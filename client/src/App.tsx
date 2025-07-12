import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { ConnectionStatus } from "./components/ConnectionStatus";
import GameTable from "./components/GameTable";
import { GameProvider } from "./context/GameContext";
import Home from "./pages/Home";

function App() {
  return (
    <GameProvider>
      <Router>
        <ConnectionStatus />
        <Routes>
          <Route
            path="/"
            element={<Home />}
          />
          <Route
            path="/game"
            element={<GameTable />}
          />
        </Routes>
      </Router>
    </GameProvider>
  );
}

export default App;
