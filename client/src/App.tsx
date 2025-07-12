import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { GameProvider } from "./context/GameContext";
import { ConnectionStatus } from "./components/ConnectionStatus";
import Home from "./pages/Home";
import GameTable from "./components/GameTable";

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
