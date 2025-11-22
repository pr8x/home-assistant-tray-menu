import React, { useEffect, useState, useCallback } from 'react';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useDebouncedCallback } from 'use-debounce';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useSettings } from '../../utils/use-settings';
import { IEntityConfig } from '../../store';
import EntityUtils from '../../utils/entity-utils';
import IState, { ThermostatAttributes } from '../../types/state';
import { sendHeight } from '../send-height';
import ElementIcon from './element-icon';

interface ThermostatElementProps {
  state: IState<ThermostatAttributes>
  entity: IEntityConfig
  refetch: () => void
}

export default function ThermostatElement(props: ThermostatElementProps) {
  const { state, entity, refetch } = props;

  const { systemAttributes: { computedOsTheme } } = useSettings();
  const [expanded, setExpanded] = useState<boolean>(false);
  const [targetTemperature, setTargetTemperature] = useState<number>(
    state.attributes.temperature || 0,
  );
  // Get current HVAC mode with fallback hierarchy: hvac_mode -> state -> hvac_action -> 'off'
  const getCurrentHvacMode = useCallback(() => state.attributes.hvac_mode
           || state.state
           || state.attributes.hvac_action
           || 'off', [state.attributes.hvac_mode, state.state, state.attributes.hvac_action]);

  const [currentHvacMode, setCurrentHvacMode] = useState<string>(getCurrentHvacMode());

  // reinitialize with new data from the server
  useEffect(() => {
    setTargetTemperature(state.attributes.temperature || 0);
    setCurrentHvacMode(getCurrentHvacMode());
  }, [state, getCurrentHvacMode]);

  // Update height after every render
  useEffect(() => {
    sendHeight();
  }, [expanded]);

  const debouncedSaveTemperature = useDebouncedCallback(
    async (newTemperature: number) => {
      await window.electronAPI.state.callServiceAction('climate', 'set_temperature', {
        entity_id: entity.entity_id,
        temperature: newTemperature,
      });
      await refetch();
    },
    500,
  );

  const debouncedSaveHvacMode = useDebouncedCallback(
    async (newHvacMode: string) => {
      await window.electronAPI.state.callServiceAction('climate', 'set_hvac_mode', {
        entity_id: entity.entity_id,
        hvac_mode: newHvacMode,
      });
      await refetch();
    },
    500,
  );

  const onChangeTemperature: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const temperature = event.target.valueAsNumber;
    setTargetTemperature(temperature);
    debouncedSaveTemperature(temperature);
  };

  const onWheel: React.WheelEventHandler = (event) => {
    const scrollChange = (event.deltaY / 100) * -1;
    const step = state.attributes.target_temp_step || 0.5;

    const newTemperature = Math.min(
      Math.max(
        targetTemperature + (scrollChange * step),
        state.attributes.min_temp || 0,
      ),
      state.attributes.max_temp || 100,
    );

    setTargetTemperature(newTemperature);
    debouncedSaveTemperature(newTemperature);
  };

  const handleModeChange = async (mode: string) => {
    setCurrentHvacMode(mode);
    debouncedSaveHvacMode(mode);
  };

  const minTemp = state.attributes.min_temp || 5;
  const maxTemp = state.attributes.max_temp || 35;
  const tempStep = state.attributes.target_temp_step || 0.5;
  const unit = state.attributes.unit_of_measurement || '°C';

  return (
    <div className={clsx({
      'pointer-events-none opacity-50': state.state === 'unavailable',
    })}
    >
      <button
        className={clsx(
          'flex h-[50px] w-full items-center px-3 hover:bg-action-hover',
          {
            'rounded-lg': computedOsTheme === 'win11',
          },
        )}
        type="button"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-10">
          <ElementIcon iconName={entity.icon || state.attributes.icon || 'mdi:thermostat'} />
        </div>
        <div className="flex flex-1 flex-col items-start">
          <h2 className="text-sm font-medium">
            {EntityUtils.getEntityName(entity, state)}
          </h2>
          <div className="flex gap-2 text-xs opacity-70">
            <span>
              {state.attributes.current_temperature !== undefined
                ? `${state.attributes.current_temperature}${unit}`
                : '--'}
            </span>
            <span>→</span>
            <span>
              {targetTemperature ? `${targetTemperature}${unit}` : '--'}
            </span>
          </div>
        </div>
        <div className="mr-1 rounded-full bg-text-primary/[.15] px-2 py-1 text-xs font-medium leading-none">
          {currentHvacMode?.toUpperCase() || 'OFF'}
        </div>
        <div className={clsx(!expanded && 'rotate-180')}>
          <ExpandLessIcon />
        </div>
      </button>

      {expanded && state.state !== 'unavailable' && (
        <div className="space-y-4 px-3 py-2">
          {/* Temperature Control */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Target Temperature</span>
              <span className="text-sm font-bold">
                {targetTemperature ? `${targetTemperature}${unit}` : '--'}
              </span>
            </div>
            <div
              className="px-2"
              onWheel={onWheel}
            >
              <div className="flex w-full items-center">
                <div className="custom-slider relative h-[36px] grow">
                  <input
                    className="group h-full w-full appearance-none bg-transparent"
                    type="range"
                    min={minTemp}
                    max={maxTemp}
                    step={tempStep}
                    value={targetTemperature || minTemp}
                    onChange={onChangeTemperature}
                  />
                  <div
                    className="pointer-events-none absolute top-[calc(50%-1px)] h-[2px] bg-accent-main"
                    style={{
                      width: `${(((targetTemperature || minTemp) - minTemp) / (maxTemp - minTemp)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* HVAC Mode Selection */}
          {state.attributes.hvac_modes && state.attributes.hvac_modes.length > 0 && (
            <div>
              <span className="mb-2 block text-sm font-medium">HVAC Mode</span>
              <div className="grid grid-cols-2 gap-1">
                {state.attributes.hvac_modes.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={twMerge(clsx(
                      'flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium leading-none transition-colors',
                      'hover:bg-action-hover',
                      {
                        'bg-accent-main text-accent-mainContrastText hover:bg-accent-main/70': currentHvacMode === mode,
                        'bg-text-primary/[.08]': currentHvacMode !== mode,
                      },
                    ))}
                    onClick={() => handleModeChange(mode)}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Temperature Range Display (for heat_cool mode) */}
          {state.attributes.target_temperature_low !== undefined
           && state.attributes.target_temperature_high !== undefined && (
           <div className="text-xs opacity-70">
             <div className="flex justify-between">
               <span>
                 Range:
                 {state.attributes.target_temperature_low}
                 {unit}
               </span>
               <span>
                 {state.attributes.target_temperature_high}
                 {unit}
               </span>
             </div>
           </div>
          )}
        </div>
      )}
    </div>
  );
}
