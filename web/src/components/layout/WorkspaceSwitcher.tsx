import { NavLink } from "react-router-dom";

export function WorkspaceSwitcher() {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/6 p-1">
      <NavLink
        to="/messenger"
        className={({ isActive }) =>
          `rounded-xl px-3 py-2 text-center text-sm font-medium transition ${
            isActive ? "bg-white/12 text-white" : "text-slate-400"
          }`
        }
      >
        Messenger
      </NavLink>
      <NavLink
        to="/map"
        className={({ isActive }) =>
          `rounded-xl px-3 py-2 text-center text-sm font-medium transition ${
            isActive ? "bg-white/12 text-white" : "text-slate-400"
          }`
        }
      >
        Map
      </NavLink>
    </div>
  );
}
