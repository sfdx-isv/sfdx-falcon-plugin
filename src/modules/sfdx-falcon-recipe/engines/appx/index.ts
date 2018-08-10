//─────────────────────────────────────────────────────────────────────────────────────────────────┐
/**
 * @file          modules/sfdx-falcon-recipe/engines/appx/index.ts
 * @copyright     Vivek M. Chawla - 2018
 * @author        Vivek M. Chawla <@VivekMChawla>
 * @version       1.0.0
 * @license       MIT
 * @summary       ???
 * @description   ???
 */
//─────────────────────────────────────────────────────────────────────────────────────────────────┘
// Import External Modules
import {Observable}               from  'rxjs';                                   // Why?

// Import Local Modules
import {SfdxFalconRecipe}         from '../../../../modules/sfdx-falcon-recipe';  // Why?
import {SfdxFalconStatus}         from '../../../../modules/sfdx-falcon-status';  // Why?
import {SfdxCliLogLevel}          from '../../../../modules/sfdx-falcon-types';   // Why?
import {SfdxFalconDebug}          from '../../../sfdx-falcon-debug';              // Why?
import {ListrTask}                from '../../../sfdx-falcon-types';              // Why?
import {ListrExecutionOptions}    from '../../../sfdx-falcon-types';              // Why?

// Require Modules
const Listr                 = require('listr');                                   // Official Task Runner of Project Falcon ;-)
const FalconUpdateRenderer  = require('falcon-listr-update-renderer');            // Custom renderer for Listr

// Set the File Local Debug Namespace
const dbgNs = 'RecipeEngine:appx:';

//─────────────────────────────────────────────────────────────────────────────┐
// Declare interfaces for AppxEngine (and derived classes)
//─────────────────────────────────────────────────────────────────────────────┘
export interface AppxEngineContext {
  isExecuting:        boolean;
  compileOptions:     any;
  devHubAlias:        string;
  targetOrg:          TargetOrg;
  haltOnError:        boolean;
  projectPath:        string;
  configPath:         string;
  mdapiSourcePath:    string;
  sfdxSourcePath:     string;
  dataPath:           string;
  logLevel:           SfdxCliLogLevel;
  recipeObserver:     any;
  status:             SfdxFalconStatus;
}
export interface AppxEngineActionContext extends AppxEngineContext {
  listrExecOptions:  ListrExecutionOptions;
}
export interface AppxEngineActionExecutor {
  (actionContext:AppxEngineActionContext, actionOptions:any):Promise<AppxEngineActionResult>;
}
export interface AppxEngineActionResult {
  type:       AppxEngineActionType;
  cmdDef:     any;
  status:     number;
  message:    string;
  strResult:  string;
  objResult:  object;
}
export interface AppxEngineActionError {
  actionContext:  AppxEngineActionContext;
  actionOptions:  any;
  errorObj:       Error;
}
export enum AppxEngineActionType {
  SFDX_CLI_COMMAND    = 'sfdx-cli-command',
  DIRECT_API_COMMAND  = 'direct-api-command',
  SHELL_COMMAND       = 'shell-command',
  UNSPECIFIED         = 'unspecified'
}
export interface AppxEngineHandler {
  handlerName: string;
  // TODO: Flesh out this interface
}
export interface AppxEngineStepGroup {
  stepGroupName:  string;
  alias:          string;
  description:    string;
  recipeSteps:    Array<AppxEngineStep>;
}
export interface AppxEngineStep {
  stepName:     string;
  description:  string;
  action:       string;
  options:      any;
  onSuccess?:   string;
  onError?:     string;
}
export interface AppxEngineStepResult {
  status:   AppxEngineStepResultStatus;
  message:  string;
  data:     any;
}
export enum AppxEngineStepResultStatus {
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR   = 'error'  
}
interface TargetOrg {
  orgName:        string;
  alias:          string;
  description:    string;
  isScratchOrg:   boolean;
  scratchDefJson: string;
  orgReqsJson:    string;
}

//─────────────────────────────────────────────────────────────────────────────────────────────────┐
/**
 * @class       AppxRecipeEngine
 * @summary     ???
 * @description ???
 * @version     1.0.0
 * @public @abstract
 */
//─────────────────────────────────────────────────────────────────────────────────────────────────┘
export abstract class AppxRecipeEngine {

  // Declare class member vars.
  private   baseClsDbgNs:         string = 'AppxRecipeEngine';
  protected actionExecutorMap:    Map<string, any>;
  protected listrTasks:           any;
  protected recipe:               SfdxFalconRecipe;
  protected engineContext:        AppxEngineContext;
  protected engineStatus:         SfdxFalconStatus;

  // Declare abstract methods.
  public    abstract async  execute(executionOptions:any):Promise<SfdxFalconStatus>;
  protected abstract async  initializeActionMap():Promise<void>;
  protected abstract async  initializeRecipeEngineContext():Promise<void>;

  //───────────────────────────────────────────────────────────────────────────┐
  /**
   * @constructs  AppxRecipeEngine
   * @description Empty, private constructor. Instantiate with compileRecipe().
   * @version     1.0.0
   * @private
   */
  //───────────────────────────────────────────────────────────────────────────┘
  protected constructor() {
    // Constructor is INTENTIONALLY empty.  Do not add code here.
  }

  //───────────────────────────────────────────────────────────────────────────┐
  /**
   * @method      compile
   * @param       {SfdxFalconRecipe}  recipe  Required.
   * @param       {any}               compileOptions  Required.
   * @returns     {Promise<any>} ???
   * @description ???
   * @version     1.0.0
   * @protected @async
   */
  //───────────────────────────────────────────────────────────────────────────┘
  protected async compile(recipe:SfdxFalconRecipe, compileOptions:any):Promise<any> {

    // Make sure that the incoming recipe has been validated.
    if (recipe.validated !== true) {
      throw new Error(`ERROR_INVALID_RECIPE: Can not compile a recipe that has not been validated`);
    }
    else {
      this.recipe = recipe;
    }

    // Initialize the Engine Context object and set the Compile Options to what was passed in.
    this.engineContext = <AppxEngineContext>{};
    this.engineContext.compileOptions = compileOptions;

    // Initialize the Recipe Engine Context (implemented inside child class)
    await this.initializeRecipeEngineContext();

    // Initialize the Action Map for this engine (implemented inside child class).
    await this.initializeActionMap();
 
    // Prepare all Listr Tasks for this recipe (implemented here inside parent class)
    this.listrTasks = this.compileParentTasks(this.recipe.recipeStepGroups);

    // We should be done by this point. Debug and return.
    SfdxFalconDebug.obj(`FALCON_XL:${dbgNs}`, this, `${this.baseClsDbgNs}:constructor:this: `)
    return;
  }

  //───────────────────────────────────────────────────────────────────────────┐
  /**
   * @method      compileParentTasks
   * @param       {Array<AppxEngineStepGroup>}  recipeStepGroups Required. ???
   * @returns     {object} Returns an instantiated Listr object fully populated
   *              with SubTasks.
   * @description ???
   * @version     1.0.0
   * @private
   */
  //───────────────────────────────────────────────────────────────────────────┘
  private compileParentTasks(recipeStepGroups:Array<AppxEngineStepGroup>):object {

    // Create a Listr object to hold Falcon Command Sequence Steps as TASKS.
    let parentTasks = new Listr({concurrent:false,collapse:false,renderer:FalconUpdateRenderer});

    // Iterate over all Recipe Step Groups and create Listr Tasks / Groups as needed.
    for (let recipeStepGroup of recipeStepGroups) {
      
      // Check if we need to skip compilation of this group
      if (this.skipGroup(recipeStepGroup.alias) === true) {
        continue;
      }
      // Check if the recipeStepGroup has any tasks
      if (this.stepGroupHasActiveTasks(recipeStepGroup) === false) {
        continue;
      }

      // Compile the SubTasks for this group and add them to the Parent Tasks we're creating
      parentTasks.add({
        title:  recipeStepGroup.stepGroupName,
        task:   (listrContext) => { return this.compileSubTasks(recipeStepGroup, listrContext) }
      });
    }

    // Return the Parent Tasks that we just created
    return parentTasks;
  }

  //───────────────────────────────────────────────────────────────────────────┐
  /**
   * @method      compileSubTasks
   * @param       {AppxRecipeStepGroup} recipeStepGroup Required. ???
   * @param       {any}                 parentContext Required. ???
   * @returns     {any} Returns an instantiated Listr object fully populated by
   *              all active Sub Tasks based on the Recipe Step Group.
   * @description ???
   * @version     1.0.0
   * @private
   */
  //───────────────────────────────────────────────────────────────────────────┘
  private compileSubTasks(recipeStepGroup:AppxEngineStepGroup, parentContext:any=null):any {

    // Make sure we have at least one step in the group.
    if (recipeStepGroup.recipeSteps.length < 1) {
      throw new Error(`ERROR_NO_STEPS: The Recipe Step Group '${recipeStepGroup.stepGroupName}' contains no Steps`);
    }

    // Create a Listr object for the subtasks.
    let listrSubTasks = new Listr({concurrent:false,collapse:false,renderer:FalconUpdateRenderer});

    // For each Recipe Step, add a new SUB TASK to the group if the step's action is not on the skip list.
    for (let recipeStep of recipeStepGroup.recipeSteps) {
      if (this.skipAction(recipeStep.action) === true) {
        continue;
      }
      listrSubTasks.add({
        title:  recipeStep.stepName,
        task:   (listrContext, thisTask) => {
          return new Observable(observer => { 
            let listrExecOptions:ListrExecutionOptions = {
              listrContext: listrContext,
              listrTask:    thisTask,
              observer:     observer
            }
            this.executeStep(recipeStep, listrExecOptions)
              .then(result => {observer.complete()})
              .catch(error => {observer.error(error)});
          });
        }
      });
    }
    // Return the Listr Sub Tasks to the caller.
    return listrSubTasks;
  }

  //───────────────────────────────────────────────────────────────────────────┐
  /**
   * @method      executeStep
   * @param       {AppxEngineStep}  recipeStep  Required. The step to execute.
   * @param       {ListrExecutionOptions} executionOptions  Required. Holds a
   *              number of execution options (context, task, and observer).
   * @returns     {Promise<any>}  Resolves with result from the Executor (or 
   *              just void) if successful, otherwise rejects with Error
   *              bubbled up from child calls.
   * @description Given a valid Falcon Recipe Step object, tries to
   *              route the requested Step Action to the appropriate Executor.
   * @version     1.0.0
   * @private @async
   */
  //───────────────────────────────────────────────────────────────────────────┘
  private async executeStep(recipeStep:AppxEngineStep, listrExecOptions:ListrExecutionOptions):Promise<AppxEngineActionResult> {

    // Build the context the Action Executor will need to correctly do its job.
    let actionContext:AppxEngineActionContext =  { 
      ...this.engineContext,
      listrExecOptions: listrExecOptions
    }

    // Find the Action Executor for the specified 
    let actionExecutor = this.actionExecutorMap.get(recipeStep.action);

    if (typeof actionExecutor === 'undefined') {
      throw new Error (`ERROR_UNKNOWN_ACTION: '${recipeStep.action}' is not recognized `
                      +`by the ${this.recipe.recipeType} eninge`);
    }

    // Execute the Action.  The caller (a listr task) will handle .then() and .catch().
    return await actionExecutor(actionContext, recipeStep.options);
  }

  //───────────────────────────────────────────────────────────────────────────┐
  /**
   * @method      killExecution
   * @param       {any} xxxx ???? 
   * @param       {any} xxxx ???? 
   * @returns     {any}
   * @description ???
   * @version     1.0.0
   * @protected
   */
  //───────────────────────────────────────────────────────────────────────────┘
  protected killExecution(errorMessage:string):void {

    // Use a generic Error Message if one was not passed in to us.
    if (errorMessage === '') {
      errorMessage = 'ERROR_UNKOWN_EXCEPTION: An unknown error has occured';
    }

    // Stop the timer so we can get an accurate Run Time if desired.
    this.engineStatus.stopTimer();

    // Throw an error using the provided error message.
    throw new Error(errorMessage);

  }

  //───────────────────────────────────────────────────────────────────────────┐
  /**
   * @method      skipAction
   * @param       {string}  actionToCheck Required. The Action to check.
   * @returns     {boolean} Returns true if the action should be skipped.
   * @description Checks if an action should be skipped during compile.
   * @version     1.0.0
   * @private
   */
  //───────────────────────────────────────────────────────────────────────────┘
  private skipAction(actionToCheck:string=''):boolean {
    return this.recipe.options.skipActions.includes(actionToCheck);
  }

  //───────────────────────────────────────────────────────────────────────────┐
  /**
   * @method      skipGroup
   * @param       {string}  groupToCheck Required. The Step Group Name to check.
   * @returns     {boolean} Returns true if the group should be skipped.
   * @description Checks if a group of steps should be skipped during compile.
   * @version     1.0.0
   * @private
   */
  //───────────────────────────────────────────────────────────────────────────┘
  private skipGroup(groupToCheck:string=''):boolean {
    return this.recipe.options.skipGroups.includes(groupToCheck);
  }

  //───────────────────────────────────────────────────────────────────────────┐
  /**
   * @method      startExecution
   * @param       {any} xxxx ???? 
   * @param       {any} xxxx ???? 
   * @returns     {any}
   * @description ???
   * @version     1.0.0
   * @protected
   */
  //───────────────────────────────────────────────────────────────────────────┘
  protected startExecution():void {



  }

  //───────────────────────────────────────────────────────────────────────────┐
  /**
   * @method      stepGroupHasActiveTasks
   * @param       {AppxEngineStepGroup}  stepGroupToCheck Required. The Step
   *              Group object that will be inspected by this method.
   * @returns     {boolean} Returns true if the group has at least one active
   *              step. An "active step" is one whose Action is not on the
   *              skipActions list.
   * @description Checks if a Step Group has at least one active step.
   * @version     1.0.0
   * @private
   */
  //───────────────────────────────────────────────────────────────────────────┘
  private stepGroupHasActiveTasks(stepGroupToCheck:AppxEngineStepGroup):boolean {
    if (stepGroupToCheck.recipeSteps.length < 1) {
      return false;
    }    
    for (let step of stepGroupToCheck.recipeSteps) {
      if (this.skipAction(step.action) === false) {
        return true;
      }
    }
    // If we get this far, every single step action was on the skip list.
    return false;
  }

  //───────────────────────────────────────────────────────────────────────────┐
  /**
   * @method      validateHandler
   * @param       {AppxEngineHandler} handler Required. 
   * @returns     {void}
   * @description ???
   * @version     1.0.0
   * @private @static
   */
  //───────────────────────────────────────────────────────────────────────────┘
  private static validateHandler(handler:AppxEngineHandler):void {
    // TODO: Implement this validation method.
  }
  //───────────────────────────────────────────────────────────────────────────┐
  /**
   * @method      validateOuterRecipe
   * @param       {SfdxFalconRecipe} recipe Required. 
   * @returns     {void}
   * @description ???
   * @version     1.0.0
   * @protected @static
   */
  //───────────────────────────────────────────────────────────────────────────┘
  protected static validateOuterRecipe(recipe:SfdxFalconRecipe):void {

    // Make sure the Recipe contains an "options" key.
    if (typeof recipe.options === 'undefined') {
      throw new Error (`ERROR_INVALID_RECIPE: Recipes in the AppX family (eg. '${recipe.recipeType}' `
                      +`must provide values in the 'options' key of your recipe`);
    }
    // Make sure there is an Array of Skip Groups
    if (Array.isArray(recipe.options.skipGroups) === false) {
      throw new Error (`ERROR_INVALID_RECIPE: An array of strings must be provided in the `
                      +`'options.skipGroups' key of your recipe.  The value provided was of type `
                      +`${typeof recipe.options.skipGroups}`);
    }
    // Make sure there is an Array of Skip Actions
    if (Array.isArray(recipe.options.skipActions) === false) {
      throw new Error (`ERROR_INVALID_RECIPE: An array of strings must be provided for the `
                      +`'options.skipActions' key of your recipe.  The value you provided was of type `
                      +`${typeof recipe.options.skipActions}`);
    }
    // Make sure that haltOnError is a boolean
    if (typeof recipe.options.haltOnError !== 'boolean') {
      throw new Error (`ERROR_INVALID_RECIPE: A boolean value must be provided for the `
                      +`'options.haltOnError' key of your recipe.  The value you provided was of type `
                      +`${typeof recipe.options.haltOnError}`);
    }
    // Make sure there is an Array of Target Orgs
    if (Array.isArray(recipe.options.targetOrgs) === false || recipe.options.targetOrgs.length < 1) {
      throw new Error (`ERROR_INVALID_RECIPE: An array with at least one Target Org must be provided in the `
                      +`'options.targetOrgs' key of your recipe.`);
    }
    // Validate every member of the Taget Orgs array.
    for (let targetOrg of recipe.options.targetOrgs) {
      AppxRecipeEngine.validateTargetOrg(targetOrg);
    }
    // Make sure there is an Array of Recipe Step Groups
    if (Array.isArray(recipe.recipeStepGroups) === false) {
      throw new Error (`ERROR_INVALID_RECIPE: An array of Recipe Step Groups must be provided at the root `
                      +`level of your recipe. The value you provided was of type `
                      +`${typeof recipe.recipeStepGroups}`);
    }
    // Validate every member of the Taget Orgs array.
    for (let recipeStepGroup of recipe.recipeStepGroups) {
      AppxRecipeEngine.validateRecipeStepGroup(recipeStepGroup);
    }
    // Make sure there is an Array of Handlers
    if (Array.isArray(recipe.handlers) === false) {
      throw new Error (`ERROR_INVALID_RECIPE: An array of Handlers must be provided at the root `
                      +`level of your recipe. The value you provided was of type `
                      +`${typeof recipe.handlers}`);
    }
    // Validate every member of the Handlers array.
    for (let handler of recipe.handlers as Array<AppxEngineHandler>) {
      AppxRecipeEngine.validateHandler(handler);
    }
    // Done with validation
    return;
  }

  //───────────────────────────────────────────────────────────────────────────┐
  /**
   * @method      validateRecipeStep
   * @param       {AppxEngineStep} recipeStep Required. 
   * @returns     {void}
   * @description ???
   * @version     1.0.0
   * @private @static
   */
  //───────────────────────────────────────────────────────────────────────────┘
  private static validateRecipeStep(recipeStep:AppxEngineStep):void {

    // TODO: Implement this validation method.

  }

  //───────────────────────────────────────────────────────────────────────────┐
  /**
   * @method      validateRecipeStepGroup
   * @param       {AppxRecipeStepGroup} stepGroup Required. 
   * @returns     {void}
   * @description ???
   * @version     1.0.0
   * @private @static
   */
  //───────────────────────────────────────────────────────────────────────────┘
  private static validateRecipeStepGroup(stepGroup:AppxEngineStepGroup):void {

    // Make sure that the Step Group Name is a string
    if (typeof stepGroup.stepGroupName !== 'string' || stepGroup.stepGroupName === '') {
      throw new Error (`ERROR_INVALID_RECIPE: Missing string value for 'stepGroupName' in  `
                      +`one of your 'recipeStepGroup' definitions `
                      +`(type provided: ${typeof stepGroup.stepGroupName})`);
    }
    // Make sure that the Alias is a string
    if (typeof stepGroup.alias !== 'string' || stepGroup.alias === '') {
      throw new Error (`ERROR_INVALID_RECIPE: Missing string value for 'alias' in the `
                      +`recipeStepGroup '${stepGroup.stepGroupName}' `
                      +`(type provided: ${typeof stepGroup.alias})`);
    }
    // Make sure that the Description is a string
    if (typeof stepGroup.description !== 'string' || stepGroup.description === '') {
      throw new Error (`ERROR_INVALID_RECIPE: Missing string value 'description' in `
                      +`one of your 'recipeStepGroup' definitions `
                      +`(type provided: ${typeof stepGroup.description})`);
    }
    // Make sure there is an Array of Recipe Steps in this group
    if (Array.isArray(stepGroup.recipeSteps) === false) {
      throw new Error (`ERROR_INVALID_RECIPE: Missing array of Recipe Steps in `
                      +`one of your 'recipeStepGroup' definitions. `
                      +`(type provided: ${typeof stepGroup.recipeSteps})`);
    }
    // Validate every member of the Recipe Steps array.
    for (let recipeStep of stepGroup.recipeSteps) {
      AppxRecipeEngine.validateRecipeStep(recipeStep);
    }
  }

  //───────────────────────────────────────────────────────────────────────────┐
  /**
   * @method      validateTargetOrg
   * @param       {TargetOrg} targetOrg Required. 
   * @returns     {void}
   * @description ???
   * @version     1.0.0
   * @private
   */
  //───────────────────────────────────────────────────────────────────────────┘
  private static validateTargetOrg(targetOrg:TargetOrg):void {

    // Make sure that orgName is a string
    if (typeof targetOrg.orgName !== 'string' || targetOrg.orgName === '') {
      throw new Error (`ERROR_INVALID_RECIPE: A string value must be provided for the `
                      +`'orgName' key in each targetOrg in your recipe.  The value you provided was of type `
                      +`${typeof targetOrg.orgName}`);
    }
    // Make sure that alias is a string
    if (typeof targetOrg.alias !== 'string' || targetOrg.alias === '') {
      throw new Error (`ERROR_INVALID_RECIPE: A string value must be provided for the `
                      +`'alias' key in each targetOrg in your recipe.  The value you provided was of type `
                      +`${typeof targetOrg.alias}`);
    }
    // Make sure that description is a string
    if (typeof targetOrg.description !== 'string' || targetOrg.description === '') {
      throw new Error (`ERROR_INVALID_RECIPE: A string value must be provided for the `
                      +`'description' key in each targetOrg in your recipe.  The value you provided was of type `
                      +`${typeof targetOrg.description}`);
    }
    // Make sure that isScratchOrg is a boolean
    if (typeof targetOrg.isScratchOrg !== 'boolean') {
      throw new Error (`ERROR_INVALID_RECIPE: A boolean value must be provided for the `
                      +`'isScratchOrg' key in each targetOrg in your recipe.  The value you provided was of type `
                      +`${typeof targetOrg.isScratchOrg}`);
    }
    // Make sure that scratchDefJson is a string if isScratchOrg is set to TRUE
    if (targetOrg.isScratchOrg === true && (typeof targetOrg.scratchDefJson !== 'string' || targetOrg.scratchDefJson === '')) {
      throw new Error (`ERROR_INVALID_RECIPE: If targetOrg.isScratchOrg is TRUE then a string value must be provided for the `
                      +`'scratchDefJson' key in that targetOrg's definition in your recipe.  The value you provided was of type `
                      +`${typeof targetOrg.scratchDefJson}`);
    }
    // Make sure that orgReqsJson is a string if isScratchOrg is set to FALSE
    if (targetOrg.isScratchOrg === false && (typeof targetOrg.orgReqsJson !== 'string' || targetOrg.orgReqsJson === '')) {
      throw new Error (`ERROR_INVALID_RECIPE: If targetOrg.isScratchOrg is FALSE then a string value must be provided for the `
                      +`'orgReqsJson' key in that targetOrg's definition in your recipe.  The value you provided was of type `
                      +`${typeof targetOrg.orgReqsJson}`);
    }
  }
} // End of class