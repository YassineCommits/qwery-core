import {
  FileSpreadsheetIcon,
  EyeIcon,
  TableIcon,
  ViewIcon,
  Loader2Icon,
  Trash2Icon,
  EditIcon,
  XIcon,
  CheckIcon,
  PencilIcon,
  MoreVerticalIcon,
  InfoIcon,
} from 'lucide-react';
import { Button } from '../../../shadcn/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../shadcn/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../shadcn/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../../shadcn/tooltip';
import { Input } from '../../../shadcn/input';
import { Badge } from '../../../shadcn/badge';
import { cn } from '../../../lib/utils';
import { useState, useEffect, useRef } from 'react';

export interface AvailableSheet {
  name: string;
  type: 'view' | 'table';
}

export interface AvailableSheetsData {
  sheets: AvailableSheet[];
  message: string;
}

interface AvailableSheetsVisualizerProps {
  data: AvailableSheetsData;
  onViewSheet?: (sheetName: string) => void;
  onDeleteSheets?: (sheetNames: string[]) => void;
  onRenameSheet?: (oldSheetName: string, newSheetName: string) => void;
  isRequestInProgress?: boolean;
}

export function AvailableSheetsVisualizer({
  data,
  onViewSheet,
  onDeleteSheets,
  onRenameSheet,
  isRequestInProgress = false,
}: AvailableSheetsVisualizerProps) {
  const { sheets, message } = data;
  const [clickedSheet, setClickedSheet] = useState<string | null>(null);
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingSheet, setEditingSheet] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [showCheckboxes, setShowCheckboxes] = useState<Set<string>>(new Set());
  const editInputRef = useRef<HTMLInputElement>(null);

  const handleViewClick = (sheetName: string) => {
    if (isRequestInProgress || clickedSheet) {
      return;
    }
    setClickedSheet(sheetName);
    onViewSheet?.(sheetName);
  };

  useEffect(() => {
    if (!isRequestInProgress && clickedSheet) {
      setClickedSheet(null);
    }
  }, [isRequestInProgress, clickedSheet]);

  const isBatchSelectMode = showCheckboxes.size > 0;

  const handleToggleSelection = (sheetName: string) => {
    setSelectedSheets((prev) => {
      const next = new Set(prev);
      if (next.has(sheetName)) {
        next.delete(sheetName);
        // Hide checkbox if deselected and no other checkboxes are visible
        setShowCheckboxes((prevCheckboxes) => {
          const nextCheckboxes = new Set(prevCheckboxes);
          nextCheckboxes.delete(sheetName);
          return nextCheckboxes;
        });
      } else {
        next.add(sheetName);
      }
      return next;
    });
  };

  const handleSelectItem = (sheetName: string) => {
    if (!isEditMode) return;
    // Show checkbox and select the item
    setShowCheckboxes((prev) => {
      const next = new Set(prev);
      next.add(sheetName);
      return next;
    });
    setSelectedSheets((prev) => {
      const next = new Set(prev);
      next.add(sheetName);
      return next;
    });
  };

  const handleDoubleClick = (sheetName: string, e: React.MouseEvent) => {
    if (!isEditMode) return;
    e.stopPropagation();
    handleSelectItem(sheetName);
  };

  const handleSingleClick = (sheetName: string, e: React.MouseEvent) => {
    if (!isEditMode || !isBatchSelectMode) return;
    // Only handle if clicking on the item itself, not on buttons/menus/inputs
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('[role="menuitem"]') ||
      target.closest('input') ||
      target.closest('[role="dialog"]') ||
      target.tagName === 'BUTTON' ||
      target.tagName === 'INPUT'
    ) {
      return;
    }
    e.stopPropagation();
    handleSelectItem(sheetName);
  };

  const handleDeleteSelected = () => {
    if (selectedSheets.size > 0) {
      setShowDeleteConfirm(true);
    }
  };

  const confirmDelete = () => {
    if (selectedSheets.size > 0 && onDeleteSheets) {
      onDeleteSheets(Array.from(selectedSheets));
      setSelectedSheets(new Set());
      setShowCheckboxes(new Set());
      setShowDeleteConfirm(false);
      setIsEditMode(false);
    }
  };

  const handleStartEdit = (sheetName: string) => {
    setEditingSheet(sheetName);
    setEditValue(sheetName);
  };

  const handleCancelEdit = () => {
    setEditingSheet(null);
    setEditValue('');
  };

  const handleSaveEdit = () => {
    if (
      editingSheet &&
      editValue.trim() &&
      editValue.trim() !== editingSheet &&
      onRenameSheet
    ) {
      onRenameSheet(editingSheet, editValue.trim());
      setEditingSheet(null);
      setEditValue('');
    }
  };

  const handleDeleteInEditMode = (sheetName: string) => {
    if (pendingDelete === sheetName) {
      // Confirm deletion
      if (onDeleteSheets) {
        onDeleteSheets([sheetName]);
        setPendingDelete(null);
      }
    } else {
      // Show confirm state
      setPendingDelete(sheetName);
    }
  };

  const handleCancelDelete = () => {
    setPendingDelete(null);
  };

  useEffect(() => {
    if (editingSheet && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingSheet]);

  if (sheets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted/30">
          <FileSpreadsheetIcon className="text-muted-foreground size-6" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">No sheets registered</p>
          <p className="text-muted-foreground text-xs">
            Register a Google Sheet to start querying and visualizing your data
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {sheets.length} sheet{sheets.length !== 1 ? 's' : ''} available
          </span>
          {!isEditMode && selectedSheets.size > 0 && (
            <Badge variant="secondary" className="text-xs">
              {selectedSheets.size} selected
            </Badge>
          )}
          {isEditMode && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Batch selection help"
                  >
                    <InfoIcon className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    Double-click an item to start batch selection, then click
                    other items to select them
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isEditMode && onDeleteSheets && selectedSheets.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteSelected}
              disabled={isRequestInProgress}
              className="h-7 text-xs"
            >
              <Trash2Icon className="mr-1.5 size-3" />
              Delete {selectedSheets.size}
            </Button>
          )}
          {!isEditMode && (onDeleteSheets || onRenameSheet) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsEditMode(true);
                setSelectedSheets(new Set());
                setShowCheckboxes(new Set());
              }}
              disabled={isRequestInProgress}
              className="h-7 text-xs"
            >
              <EditIcon className="mr-1.5 size-3" />
              Edit
            </Button>
          )}
          {isEditMode && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsEditMode(false);
                setEditingSheet(null);
                setEditValue('');
                setSelectedSheets(new Set());
                setShowCheckboxes(new Set());
              }}
              className="h-7 text-xs"
            >
              <XIcon className="mr-1.5 size-3" />
              Done
            </Button>
          )}
        </div>
      </div>

      {/* Sheets List */}
      <div className="space-y-2">
        {sheets.map((sheet) => {
          const isClicked = clickedSheet === sheet.name;
          const isDisabled =
            isRequestInProgress || (clickedSheet !== null && !isClicked);
          const TypeIcon = sheet.type === 'view' ? ViewIcon : TableIcon;
          const isSelected = selectedSheets.has(sheet.name);
          const isEditing = editingSheet === sheet.name;
          const isPendingDelete = pendingDelete === sheet.name;
          const showCheckbox = showCheckboxes.has(sheet.name);

          return (
            <div
              key={sheet.name}
              onDoubleClick={(e) => handleDoubleClick(sheet.name, e)}
              onClick={(e) => handleSingleClick(sheet.name, e)}
              className={cn(
                'group flex items-center gap-3 rounded-lg border-2 px-4 py-3 transition-all',
                isEditMode && isSelected && 'border-destructive',
                isClicked && !isEditMode && 'border-primary',
                isPendingDelete && 'border-destructive bg-destructive/5',
                !isEditMode && !isClicked && !isPendingDelete && 'border-border',
                isDisabled && !isSelected && !isEditMode && 'opacity-60',
                isEditMode && 'cursor-pointer',
              )}
            >
              {/* Checkbox for selection (only shown when double-clicked in edit mode) */}
              {isEditMode && onDeleteSheets && showCheckbox && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleToggleSelection(sheet.name)}
                  disabled={isRequestInProgress}
                  className="size-4 cursor-pointer rounded border-gray-300 text-destructive focus:ring-destructive"
                />
              )}
              {isEditMode && onDeleteSheets && !showCheckbox && (
                <div className="size-4" />
              )}

              {/* Icon */}
              <div
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                  isClicked && !isEditMode
                    ? 'bg-primary/10 text-primary'
                    : isSelected && isEditMode
                      ? 'bg-destructive/10 text-destructive'
                      : isPendingDelete
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-muted/50 text-muted-foreground',
                )}
              >
                <TypeIcon className="size-4.5" />
              </div>

              {/* Sheet Info */}
              <div className="min-w-0 flex-1">
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <Input
                      ref={editInputRef}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveEdit();
                        } else if (e.key === 'Escape') {
                          handleCancelEdit();
                        }
                      }}
                      className="h-8 text-sm"
                      disabled={isRequestInProgress}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handleSaveEdit}
                      disabled={
                        isRequestInProgress ||
                        !editValue.trim() ||
                        editValue.trim() === sheet.name
                      }
                    >
                      <CheckIcon className="size-4 text-emerald-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handleCancelEdit}
                      disabled={isRequestInProgress}
                    >
                      <XIcon className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <span
                    className={cn(
                      'truncate text-sm font-medium',
                      isClicked && !isEditMode && 'text-primary',
                      isPendingDelete && 'text-destructive',
                    )}
                  >
                    {sheet.name}
                  </span>
                )}
              </div>

              {/* Actions */}
              {isEditMode ? (
                <div className="flex items-center gap-2 shrink-0">
                  {(onRenameSheet || onDeleteSheets) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={isRequestInProgress || isEditing}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVerticalIcon className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {onRenameSheet && !isPendingDelete && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit(sheet.name);
                            }}
                            disabled={isRequestInProgress || isEditing}
                          >
                            <PencilIcon className="mr-2 size-4" />
                            Rename
                          </DropdownMenuItem>
                        )}
                        {onDeleteSheets && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteInEditMode(sheet.name);
                            }}
                            disabled={isRequestInProgress}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2Icon className="mr-2 size-4" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  {isPendingDelete && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-8 px-3"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteInEditMode(sheet.name);
                        }}
                        disabled={isRequestInProgress}
                      >
                        <CheckIcon className="mr-1.5 size-3.5" />
                        Confirm
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelDelete();
                        }}
                        disabled={isRequestInProgress}
                      >
                        <XIcon className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                onViewSheet && (
                  <Button
                    variant={isClicked ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 shrink-0 px-4 font-medium"
                    disabled={isDisabled}
                    onClick={() => handleViewClick(sheet.name)}
                  >
                    {isClicked ? (
                      <>
                        <Loader2Icon className="mr-2 size-3.5 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <EyeIcon className="mr-2 size-3.5" />
                        View Sheet
                      </>
                    )}
                  </Button>
                )
              )}
            </div>
          );
        })}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete Sheet{selectedSheets.size !== 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedSheets.size === 1 ? (
                <>
                  Are you sure you want to delete{' '}
                  <span className="font-mono font-semibold">
                    {Array.from(selectedSheets)[0]}
                  </span>
                  ? This action cannot be undone and will permanently remove the
                  sheet and all its data.
                </>
              ) : (
                <>
                  Are you sure you want to delete {selectedSheets.size} sheets?
                  <div className="mt-2 space-y-1">
                    <p className="font-medium">Sheets to be deleted:</p>
                    <ul className="list-inside list-disc space-y-1 text-xs">
                      {Array.from(selectedSheets).map((name) => (
                        <li key={name} className="font-mono">
                          {name}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="mt-2">
                    This action cannot be undone and will permanently remove
                    these sheets and all their data.
                  </p>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete{' '}
              {selectedSheets.size !== 1
                ? `${selectedSheets.size} sheets`
                : 'sheet'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
