import React from "react";

export interface CardProps {
  suit: "hearts" | "diamonds" | "clubs" | "spades";
  rank: string;
  isFaceUp?: boolean;
  isSelectable?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const Card: React.FC<CardProps> = ({
  suit,
  rank,
  isFaceUp = true,
  isSelectable = false,
  isSelected = false,
  onClick,
  className = "",
  size = "md",
}) => {
  const suitSymbols = {
    hearts: "笙･",
    diamonds: "笙ｦ",
    clubs: "笙｣",
    spades: "笙",
  };

  const suitColors = {
    hearts: "text-red-600",
    diamonds: "text-yellow-500",
    clubs: "text-green-600",
    spades: "text-blue-600",
  };

  const sizeClasses = {
    sm: "w-12 h-16 text-xs",
    md: "w-16 h-24 text-sm",
    lg: "w-20 h-28 text-base",
  };

  if (!isFaceUp) {
    return (
      <div
        className={`
          ${sizeClasses[size]}
          bg-gradient-to-br from-blue-600 to-blue-800 
          border-2 border-blue-700 rounded-lg shadow-card
          ${
            isSelectable
              ? "cursor-pointer hover:shadow-card-hover transition-all duration-200"
              : ""
          }
          ${isSelected ? "ring-2 ring-yellow-400 ring-offset-2" : ""}
          ${className}
        `}
        onClick={isSelectable ? onClick : undefined}
      >
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-white font-bold text-lg">笙</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`
        ${sizeClasses[size]}
        bg-white border-2 border-gray-300 rounded-lg shadow-card
        ${isSelectable ? "cursor-pointer transition-all duration-200" : ""}
        ${isSelected ? "ring-2 ring-yellow-400 ring-offset-2" : ""}
        ${className}
      `}
      onClick={isSelectable ? onClick : undefined}
      style={{
        position: "relative",
        overflow: "hidden",
        transition: "transform 0.2s",
        transform: isSelected ? "translateY(-8px)" : undefined,
      }}
      onMouseEnter={
        isSelectable
          ? (e) => {
              (e.currentTarget as HTMLDivElement).style.transform = isSelected
                ? "translateY(-8px)"
                : "translateY(-4px)";
            }
          : undefined
      }
      onMouseLeave={
        isSelectable
          ? (e) => {
              (e.currentTarget as HTMLDivElement).style.transform = isSelected
                ? "translateY(-8px)"
                : "translateY(0)";
            }
          : undefined
      }
    >
      <div className="w-full h-full p-2 flex flex-col justify-between relative">
        {/* 蟾ｦ荳奇ｼ壼ｰ上＆縺上せ繝ｼ繝茨ｼ九Λ繝ｳ繧ｯ */}
        <div className="absolute top-1 left-2 flex flex-col items-start z-10">
          <div className={`font-card font-bold text-xs ${suitColors[suit]}`}>
            {rank}
          </div>
          <div className={`text-xs ${suitColors[suit]}`}>
            {suitSymbols[suit]}
          </div>
        </div>
        {/* 蜿ｳ荳具ｼ壼ｰ上＆縺上せ繝ｼ繝茨ｼ九Λ繝ｳ繧ｯ・・80蠎ｦ蝗櫁ｻ｢・・*/}
        <div className="absolute bottom-1 right-2 flex flex-col items-end z-10 rotate-180">
          <div className={`font-card font-bold text-xs ${suitColors[suit]}`}>
            {rank}
          </div>
          <div className={`text-xs ${suitColors[suit]}`}>
            {suitSymbols[suit]}
          </div>
        </div>
        {/* 荳ｭ螟ｮ・壼､ｧ縺阪￥譁懊ａ繝ｩ繝ｳ繧ｯ */}
        <div className="flex justify-center items-center flex-1">
          <span
            className={`text-4xl font-bold ${suitColors[suit]} -rotate-12 select-none`}
          >
            {rank}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Card;
