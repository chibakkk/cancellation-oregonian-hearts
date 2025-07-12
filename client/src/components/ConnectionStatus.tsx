import React from "react";
import { useGame } from "../context/useGame";

export const ConnectionStatus: React.FC = () => {
  const { isConnected, connectionError, reconnect } = useGame();

  const getStatusColor = () => {
    if (isConnected) return "bg-green-500";
    if (connectionError) return "bg-red-500";
    return "bg-yellow-500";
  };

  const getStatusText = () => {
    if (isConnected) return "接続中";
    if (connectionError) return "エラー";
    return "接続中...";
  };

  if (isConnected && !connectionError) {
    return (
      <div className="fixed top-4 right-4 z-50">
        <div className="flex items-center space-x-2 bg-white/90 rounded-lg px-3 py-2 shadow-lg">
          <div className={`w-3 h-3 rounded-full ${getStatusColor()}`}></div>
          <span className="text-sm font-medium text-gray-700">
            {getStatusText()}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="bg-white/90 rounded-lg px-4 py-3 shadow-lg max-w-sm">
        <div className="flex items-center space-x-2 mb-2">
          <div className={`w-3 h-3 rounded-full ${getStatusColor()}`}></div>
          <span className="text-sm font-medium text-gray-700">
            {getStatusText()}
          </span>
        </div>
        {connectionError && (
          <p className="text-xs text-red-600 mb-2">{connectionError}</p>
        )}
        <button
          onClick={reconnect}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1 rounded transition-colors"
        >
          再接綁E
        </button>
      </div>
    </div>
  );
};
