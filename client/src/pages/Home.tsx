import React, { useState } from "react";
import GameButton from "../components/GameButton";
import { useGame } from "../context/useGame";
import { useNavigate } from "react-router-dom";

const Home: React.FC = () => {
  const { state, createRoom, joinRoom, startGame } = useGame();
  const [playerName, setPlayerName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [password, setPassword] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    if (!playerName.trim() || !password.trim()) {
      setError("繝励Ξ繧､繝､繝ｼ蜷阪→繝代せ繝ｯ繝ｼ繝峨ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞");
      return;
    }
    if (password.length !== 4 || !/^\d+$/.test(password)) {
      setError("繝代せ繝ｯ繝ｼ繝峨・4譯√・謨ｰ蟄励〒蜈･蜉帙＠縺ｦ縺上□縺輔＞");
      return;
    }

    setError(null);
    setIsCreating(true);

    // 繝ｫ繝ｼ繝ID繧定・蜍慕函謌撰ｼ・譁・ｭ励・闍ｱ謨ｰ蟄暦ｼ・    const generatedRoomId = Math.random()
      .toString(36)
      .substring(2, 7)
      .toUpperCase();

    console.log("繝ｫ繝ｼ繝菴懈・髢句ｧ・", {
      roomId: generatedRoomId,
      password,
      playerName,
    });

    createRoom({ roomId: generatedRoomId, password, playerName }, (res) => {
      console.log("繝ｫ繝ｼ繝菴懈・繝ｬ繧ｹ繝昴Φ繧ｹ:", res);
      if (res?.error) {
        console.log("繧ｨ繝ｩ繝ｼ逋ｺ逕・", res.error);
        setError(res.error);
        setIsCreating(false);
      } else {
        console.log("繝ｫ繝ｼ繝菴懈・謌仙粥");
        setIsCreating(false);
        setCreatedRoomId(generatedRoomId);
        setSuccessMessage(`繝ｫ繝ｼ繝縲・{generatedRoomId}縲阪ｒ菴懈・縺励∪縺励◆・～);
        setTimeout(() => {
          navigate("/game");
        }, 2000); // 2遘帝俣陦ｨ遉ｺ
      }
    });
  };

  const handleJoinRoom = () => {
    if (!playerName.trim() || !roomId.trim() || !password.trim()) {
      setError("縺吶∋縺ｦ縺ｮ鬆・岼繧貞・蜉帙＠縺ｦ縺上□縺輔＞");
      return;
    }
    if (!/^[A-Z0-9]{5}$/.test(roomId)) {
      setError("繝ｫ繝ｼ繝ID縺ｯ5譁・ｭ励・闍ｱ謨ｰ蟄励〒蜈･蜉帙＠縺ｦ縺上□縺輔＞");
      return;
    }
    if (password.length !== 4 || !/^\d+$/.test(password)) {
      setError("繝代せ繝ｯ繝ｼ繝峨・4譯√・謨ｰ蟄励〒蜈･蜉帙＠縺ｦ縺上□縺輔＞");
      return;
    }

    setError(null);
    setIsJoining(true);
    joinRoom({ roomId, playerName, password }, (res) => {
      if (res?.error) {
        setError(res.error);
        setIsJoining(false);
      } else {
        setIsJoining(false);
        navigate("/game");
      }
    });
  };

  const handleStartGame = () => {
    startGame({ roomId }, (res) => {
      if (res?.error) {
        setError(res.error);
      }
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-600 via-purple-700 to-blue-800 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="mt-8 w-full max-w-md">
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 max-w-md w-full relative z-10 border border-white/20">
          <div className="text-center mb-8">
            <div className="mb-4">
              <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-red-700 rounded-full mx-auto mb-3 flex items-center justify-center shadow-lg">
                <span className="text-white text-2xl font-bold">笙</span>
              </div>
            </div>
            <h1 className="text-4xl font-bold text-gray-800 mb-2 bg-gradient-to-r from-red-600 to-purple-600 bg-clip-text text-transparent">
              繧ｭ繝｣繝ｳ繧ｻ繝ｬ繝ｼ繧ｷ繝ｧ繝ｳ
            </h1>
            <h2 className="text-2xl font-semibold text-gray-700 mb-1">
              繧ｪ繝ｬ繧ｴ繝九い繝ｳ
            </h2>
            <h3 className="text-xl font-medium text-gray-600">繝上・繝・/h3>
            <div className="mt-3 flex justify-center space-x-2">
              <span className="text-red-500 text-lg">笙･</span>
              <span className="text-black text-lg">笙</span>
              <span className="text-red-500 text-lg">笙ｦ</span>
              <span className="text-black text-lg">笙｣</span>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 rounded-r mb-6 animate-pulse">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-red-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="bg-green-50 border-l-4 border-green-400 text-green-700 px-4 py-3 rounded-r mb-6 animate-pulse">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-green-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-bold">{successMessage}</p>
                  {createdRoomId && (
                    <div className="mt-2 p-2 bg-green-100 rounded border">
                      <p className="text-xs text-green-800 mb-1">繝ｫ繝ｼ繝ID:</p>
                      <p className="text-lg font-mono font-bold text-green-900">
                        {createdRoomId}
                      </p>
                      <p className="text-xs text-green-700 mt-1">
                        縺薙・ID繧剃ｻ悶・繝励Ξ繧､繝､繝ｼ縺ｫ蜈ｱ譛峨＠縺ｦ縺上□縺輔＞
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                繝励Ξ繧､繝､繝ｼ蜷・              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 bg-white/80 backdrop-blur-sm"
                placeholder="縺ゅ↑縺溘・蜷榊燕"
                maxLength={20}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                繝代せ繝ｯ繝ｼ繝会ｼ・譯√・謨ｰ蟄暦ｼ・              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 bg-white/80 backdrop-blur-sm font-mono text-center text-lg tracking-widest"
                placeholder="0000"
                maxLength={4}
                pattern="[0-9]{4}"
              />
            </div>

            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                繝ｫ繝ｼ繝繧剃ｽ懈・
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                譁ｰ縺励＞繝ｫ繝ｼ繝繧剃ｽ懈・縺励∪縺吶ゅΝ繝ｼ繝ID縺ｯ閾ｪ蜍慕函謌舌＆繧後∪縺吶・              </p>
              <GameButton
                onClick={handleCreateRoom}
                disabled={isCreating}
                loading={isCreating}
                variant="primary"
                className="w-full"
              >
                譁ｰ縺励＞繝ｫ繝ｼ繝繧剃ｽ懈・
              </GameButton>
            </div>

            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                繝ｫ繝ｼ繝縺ｫ蜿ょ刈
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                譌｢蟄倥・繝ｫ繝ｼ繝縺ｫ蜿ょ刈縺励∪縺吶ゅΝ繝ｼ繝ID縺ｨ繝代せ繝ｯ繝ｼ繝峨′蠢・ｦ√〒縺吶・              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    繝ｫ繝ｼ繝ID
                  </label>
                  <input
                    type="text"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 bg-white/80 backdrop-blur-sm font-mono text-center text-lg tracking-wider"
                    placeholder="萓・ ABC12"
                    maxLength={5}
                  />
                </div>
                <GameButton
                  onClick={handleJoinRoom}
                  disabled={isJoining}
                  loading={isJoining}
                  variant="success"
                  className="w-full"
                >
                  繝ｫ繝ｼ繝縺ｫ蜿ょ刈
                </GameButton>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                <span className="w-2 h-2 bg-yellow-500 rounded-full mr-3"></span>
                繧ｲ繝ｼ繝繧帝幕蟋・              </h3>
              <GameButton
                onClick={handleStartGame}
                disabled={!state || state.players.length < 4}
                loading={!state || state.players.length < 4}
                variant="primary"
                className="w-full"
              >
                繧ｲ繝ｼ繝繧帝幕蟋・              </GameButton>
            </div>
          </div>

          <div className="mt-8 text-center text-sm text-gray-600 bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-center mb-2">
              <span className="text-purple-500 mr-2">笙</span>
              <p className="font-semibold">繧ｲ繝ｼ繝諠・ｱ</p>
              <span className="text-purple-500 ml-2">笙</span>
            </div>
            <p className="mb-1">4-10莠ｺ縺ｧ繝励Ξ繧､蜿ｯ閭ｽ</p>
            <p className="text-gray-500">繧ｲ繧ｹ繝医・繝ｬ繧､縺ｧ縺頑･ｽ縺励∩縺上□縺輔＞</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
