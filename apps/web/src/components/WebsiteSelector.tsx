import { useList } from "@refinedev/core";
import { Button, Space, Grid, Tag, Input, Checkbox, Typography } from "antd";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";

const { useBreakpoint } = Grid;
const { TextArea } = Input;
const { Text } = Typography;

interface Props {
  value?: string[];
  onChange?: (ids: string[]) => void;
}

export const WebsiteSelector = ({ value = [], onChange }: Props) => {
  const { data, isLoading } = useList({
    resource: "websites",
    filters: [{ field: "status", operator: "eq", value: "active" }],
    pagination: { pageSize: 9999 },
  });
  const screens = useBreakpoint();

  const [selectedKeys, setSelectedKeys] = useState<string[]>(value);
  const [filterText, setFilterText] = useState("");
  const lastClickedIndex = useRef<number | null>(null);

  useEffect(() => {
    setSelectedKeys(value);
  }, [value]);

  const websites = (data?.data ?? []).filter((w: any) => !w.excludeFromDeployment);

  const sortedWebsites = useMemo(() => {
    return [...websites].sort((a: any, b: any) => {
      const aSelected = selectedKeys.includes(a._id) ? 0 : 1;
      const bSelected = selectedKeys.includes(b._id) ? 0 : 1;
      if (aSelected !== bSelected) return aSelected - bSelected;
      return a.domain.localeCompare(b.domain);
    });
  }, [websites, selectedKeys]);

  const filteredWebsites = useMemo(() => {
    if (!filterText.trim()) return sortedWebsites;
    const terms = filterText
      .split(/[,\n]+/)
      .map((t) => t.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase())
      .filter(Boolean);
    if (!terms.length) return sortedWebsites;
    return sortedWebsites.filter((w: any) =>
      terms.some((term) => w.domain.toLowerCase().includes(term)),
    );
  }, [sortedWebsites, filterText]);

  const updateSelection = useCallback(
    (ids: string[]) => {
      setSelectedKeys(ids);
      onChange?.(ids);
    },
    [onChange],
  );

  const handleCheckboxClick = useCallback(
    (id: string, index: number, shiftKey: boolean) => {
      const isSelected = selectedKeys.includes(id);

      if (shiftKey && lastClickedIndex.current !== null) {
        const start = Math.min(lastClickedIndex.current, index);
        const end = Math.max(lastClickedIndex.current, index);
        const rangeIds = filteredWebsites.slice(start, end + 1).map((w: any) => w._id);
        const newKeys = isSelected
          ? selectedKeys.filter((k) => !rangeIds.includes(k))
          : [...new Set([...selectedKeys, ...rangeIds])];
        updateSelection(newKeys);
      } else {
        const newKeys = isSelected
          ? selectedKeys.filter((k) => k !== id)
          : [...selectedKeys, id];
        updateSelection(newKeys);
      }
      lastClickedIndex.current = index;
    },
    [selectedKeys, filteredWebsites, updateSelection],
  );

  const selectAllFiltered = () => {
    const ids = filteredWebsites.map((w: any) => w._id);
    updateSelection([...new Set([...selectedKeys, ...ids])]);
  };

  const deselectAll = () => updateSelection([]);

  const columns = screens.xl ? 4 : screens.lg ? 3 : screens.md ? 2 : 1;

  const columnData = useMemo(() => {
    const cols: any[][] = Array.from({ length: columns }, () => []);
    filteredWebsites.forEach((w: any, i: number) => {
      cols[i % columns].push({ ...w, _globalIndex: i });
    });
    return cols;
  }, [filteredWebsites, columns]);

  return (
    <div>
      <Space style={{ marginBottom: 8 }} wrap>
        <Button size="small" onClick={selectAllFiltered}>
          Select All{filterText.trim() ? " Filtered" : ""}
        </Button>
        <Button size="small" onClick={deselectAll}>Deselect All</Button>
        <Tag>{selectedKeys.length} / {websites.length} selected</Tag>
      </Space>
      <Input
        placeholder="Filter domains (comma or newline separated, e.g. example.com, test.org)"
        allowClear
        size="small"
        value={filterText.includes("\n") ? undefined : filterText}
        style={{ marginBottom: 8, display: filterText.includes("\n") ? "none" : undefined }}
        onChange={(e) => setFilterText(e.target.value)}
      />
      {filterText.includes("\n") && (
        <TextArea
          rows={2}
          size="small"
          value={filterText}
          placeholder="One domain per line or comma-separated"
          style={{ marginBottom: 8 }}
          onChange={(e) => setFilterText(e.target.value)}
        />
      )}
      {!isLoading && (
        <div
          style={{
            maxHeight: 300,
            overflowY: "auto",
            border: "1px solid var(--ant-color-border, #d9d9d9)",
            borderRadius: 6,
            padding: "4px 0",
          }}
        >
          {filteredWebsites.length === 0 ? (
            <div style={{ textAlign: "center", padding: 16 }}>
              <Text type="secondary">No matching domains</Text>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 0 }}>
              {columnData.map((col, colIndex) => (
                <div key={colIndex} style={{ flex: 1, minWidth: 0 }}>
                  {col.map((w: any) => (
                    <div
                      key={w._id}
                      onClick={(e) => handleCheckboxClick(w._id, w._globalIndex, e.shiftKey)}
                      style={{
                        padding: "4px 12px",
                        cursor: "pointer",
                        userSelect: "none",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        background: selectedKeys.includes(w._id)
                          ? "var(--ant-color-primary-bg, #e6f4ff)"
                          : undefined,
                      }}
                    >
                      <Checkbox
                        checked={selectedKeys.includes(w._id)}
                        style={{ marginRight: 8, pointerEvents: "none" }}
                      />
                      <Text style={{ fontSize: 13 }}>{w.domain}</Text>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {isLoading && (
        <div style={{ textAlign: "center", padding: 24 }}>
          <Text type="secondary">Loading websites...</Text>
        </div>
      )}
    </div>
  );
};
