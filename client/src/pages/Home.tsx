import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import GameButton from "../components/GameButton";
import { useGame } from "../context/useGame";

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
      setError("プレイヤー名とパスワードを入力してください");
      return;
    }
    if (password.length !== 4 || !/^\d+$/.test(password)) {
      setError("パスワードは4桁の数字で入力してください");
      return;
    }

    setError(null);
    setIsCreating(true);

    // ルームIDを自動生成（5桁の英数字）
    const generatedRoomId = Math.random()
      .toString(36)
      .substring(2, 7)
      .toUpperCase();

    console.log("ルーム作成開始", {
      roomId: generatedRoomId,
      password,
      playerName,
    });

    createRoom({ roomId: generatedRoomId, password, playerName }, (res) => {
      console.log("ルーム作成レスポンス:", res);
      if (res?.error) {
        console.log("エラー発生:", res.error);
        setError(res.error);
        setIsCreating(false);
      } else {
        console.log("ルーム作成成功");
        setIsCreating(false);
        setCreatedRoomId(generatedRoomId);
        setSuccessMessage(`ルーム「${generatedRoomId}」を作成しました！`);
        setTimeout(() => {
          navigate("/game");
        }, 2000); // 2秒間表示
      }
    });
  };

  const handleJoinRoom = () => {
    if (!playerName.trim() || !roomId.trim() || !password.trim()) {
      setError("すべての項目を入力してください");
      return;
    }
    if (!/^[A-Z0-9]{5}$/.test(roomId)) {
      setError("ルームIDは5桁の英数字で入力してください");
      return;
    }
    if (password.length !== 4 || !/^\d+$/.test(password)) {
      setError("パスワードは4桁の数字で入力してください");
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
                <span className="text-white text-2xl font-bold">♠</span>
              </div>
            </div>
            <h1 className="text-4xl font-bold text-gray-800 mb-2 bg-gradient-to-r from-red-600 to-purple-600 bg-clip-text text-transparent">
              キャンセレーション
            </h1>
            <h2 className="text-2xl font-semibold text-gray-700 mb-1">
              オレゴニアン
            </h2>
            <h3 className="text-xl font-medium text-gray-600">ハート</h3>
            <div className="mt-3 flex justify-center space-x-2">
              <span className="text-red-500 text-lg">♥</span>
              <span className="text-black text-lg">♠</span>
              <span className="text-red-500 text-lg">♦</span>
              <span className="text-black text-lg">♣</span>
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
                      <p className="text-xs text-green-800 mb-1">ルームID:</p>
                      <p className="text-lg font-mono font-bold text-green-900">
                        {createdRoomId}
                      </p>
                      <p className="text-xs text-green-700 mt-1">
                        このIDを他のプレイヤーに共有してください
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
                プレイヤー名{" "}
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 bg-white/80 backdrop-blur-sm"
                placeholder="あなたの名前"
                maxLength={20}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                パスワード（4桁の数字）{" "}
              </label>
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
                ルームを作成
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                新しいルームを作成します。ルームIDは自動生成されます。{" "}
              </p>
              <GameButton
                onClick={handleCreateRoom}
                disabled={isCreating}
                loading={isCreating}
                variant="primary"
                className="w-full"
              >
                新しいルームを作成
              </GameButton>
            </div>

            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                ルームに参加
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                既存のルームに参加します。ルームIDとパスワードが必要です。{" "}
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    ルームID
                  </label>
                  <input
                    type="text"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 bg-white/80 backdrop-blur-sm font-mono text-center text-lg tracking-wider"
                    placeholder="例: ABC12"
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
                  ルームに参加
                </GameButton>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                <span className="w-2 h-2 bg-yellow-500 rounded-full mr-3"></span>
                ゲームを開始{" "}
              </h3>
              <GameButton
                onClick={handleStartGame}
                disabled={!state || state.players.length < 4}
                loading={!state || state.players.length < 4}
                variant="primary"
                className="w-full"
              >
                ゲームを開始{" "}
              </GameButton>
            </div>
          </div>

          <div className="mt-8 text-center text-sm text-gray-600 bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-center mb-2">
              <span className="text-purple-500 mr-2">♠</span>
              <p className="font-semibold">ゲーム説明</p>
              <span className="text-purple-500 ml-2">♠</span>
            </div>
            <p className="mb-1">4-10人でプレイ可能</p>
            <p className="text-gray-500">ゲストプレイでお楽しみください</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
